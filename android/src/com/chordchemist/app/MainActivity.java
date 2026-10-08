package com.chordchemist.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.DisplayCutout;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import org.json.JSONObject;

/** Full-screen WebView around the single-file app in assets/index.html. */
public class MainActivity extends Activity {
    private WebView web;
    private SharedPreferences prefs;
    private final FileSink sink = new FileSink();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The loading screen's cream from the first frame (it is light in both themes),
        // so there's no flash of another colour before it draws.
        int background = Color.parseColor("#EFEAE2");
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        web = new WebView(this);
        web.setBackgroundColor(background);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // saved progressions
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100); // the layout is sized in CSS pixels; ignore the system font scale
        web.setWebViewClient(new WebViewClient());
        prefs = getSharedPreferences("chord-chemist", MODE_PRIVATE);
        web.addJavascriptInterface(new Object() {
            // Saved state (chart, banks, theme). WebView's localStorage does not come back after
            // the app is killed, so the page keeps a copy of each item here and reads it first.
            @JavascriptInterface
            public String getItem(String key) { return prefs.getString(key, null); }

            @JavascriptInterface
            public void putItem(String key, String value) { prefs.edit().putString(key, value).commit(); }

            // The page asks to be told when its loading screen has actually reached the display,
            // so the 2.5 s it stays up are all visible (WebView's first frame can lag the page).
            @JavascriptInterface
            public void splashReady() {
                runOnUiThread(() -> web.postVisualStateCallback(1, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        web.postOnAnimation(() -> web.postOnAnimation(() -> web.evaluateJavascript(
                            "window.__splashOnScreen && window.__splashOnScreen()", null)));
                    }
                }));
            }

            // An exported backing track arrives in base64 chunks and goes to the Downloads folder;
            // the page hears back through window.__fileSaved(ok, where).
            @JavascriptInterface
            public void beginFile(String name, String mime) { sink.begin(name, mime); }

            @JavascriptInterface
            public void appendFile(String chunk) { sink.append(chunk); }

            @JavascriptInterface
            public void endFile() {
                String where = sink.end();
                boolean ok = where != null;
                String message = ok ? where : sink.error;
                runOnUiThread(() -> web.evaluateJavascript(
                    "window.__fileSaved && window.__fileSaved(" + ok + ", " + JSONObject.quote(message) + ")", null));
            }
        }, "ChordChemistAndroid");
        // Keep the app clear of camera cutouts when drawing edge to edge.
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            int l = 0, t = 0, r = 0, b = 0;
            if (Build.VERSION.SDK_INT >= 28) {
                DisplayCutout c = insets.getDisplayCutout();
                if (c != null) { l = c.getSafeInsetLeft(); t = c.getSafeInsetTop(); r = c.getSafeInsetRight(); b = c.getSafeInsetBottom(); }
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
        hideSystemBars();
    }

    /**
     * Writes an exported file to the phone's Downloads folder: through MediaStore on Android 10
     * and later, and into the app's own Download folder before that (neither needs a permission).
     */
    private final class FileSink {
        private OutputStream out;
        private Uri uri;
        private File file;
        String error;

        void begin(String name, String mime) {
            error = null;
            uri = null;
            file = null;
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Chord Chemist");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new IOException("The Downloads folder is not available");
                    out = getContentResolver().openOutputStream(uri);
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null || (!dir.isDirectory() && !dir.mkdirs())) throw new IOException("No storage for downloads");
                    file = new File(dir, name);
                    out = new FileOutputStream(file);
                }
            } catch (Exception e) {
                fail(e);
            }
        }

        void append(String chunk) {
            if (out == null) return;
            try {
                out.write(Base64.decode(chunk, Base64.DEFAULT));
            } catch (Exception e) {
                fail(e);
            }
        }

        /** Closes the file and returns where it went, or null after a failure (see `error`). */
        String end() {
            try {
                if (out != null) out.close();
            } catch (Exception e) {
                fail(e);
            }
            out = null;
            if (error != null) {
                if (uri != null) getContentResolver().delete(uri, null, null);
                return null;
            }
            if (uri != null) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(uri, v, null, null);
                return "Download/Chord Chemist (open your Files app)";
            }
            MediaScannerConnection.scanFile(MainActivity.this, new String[] { file.getAbsolutePath() }, null, null);
            return file.getAbsolutePath();
        }

        private void fail(Exception e) {
            if (error == null) error = e.getMessage() == null ? e.toString() : e.getMessage();
            try {
                if (out != null) out.close();
            } catch (Exception x) {
                // nothing more to do
            }
            out = null;
        }
    }

    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
