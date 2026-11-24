package kr.trip.collector;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;

public final class MainActivity extends Activity {
    private static final String HOME = TripConnection.ORIGIN + "/";
    private static final int COLLECTOR_SETTINGS = 1;
    private final ExecutorService pairing = Executors.newSingleThreadExecutor();
    private int selection;
    private AlertDialog progress;
    private boolean trustedDocument;
    private static final int SURFACE = Color.rgb(245, 250, 239);
    private WebView web;
    private LinearLayout errorPanel;
    private String failedUrl;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(SURFACE);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            getWindow().getInsetsController().setSystemBarsAppearance(lightBars, lightBars);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }

        Button settings = new Button(this, null, android.R.attr.borderlessButtonStyle);
        settings.setText("카드 수집 설정");
        settings.setTextColor(Color.rgb(48, 92, 36));
        settings.setOnClickListener(v -> openSettings());
        LinearLayout.LayoutParams actionSize = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        actionSize.gravity = Gravity.END;
        root.addView(settings, actionSize);

        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        web = new WebView(this);
        content.addView(web);
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setBackgroundColor(SURFACE);
        TextView message = new TextView(this);
        message.setText("여행 웹을 열 수 없어요. 연결을 확인해 주세요.");
        errorPanel.addView(message);
        Button retry = new Button(this);
        retry.setText("다시 시도");
        retry.setOnClickListener(v -> web.loadUrl(failedUrl != null ? failedUrl : HOME));
        errorPanel.addView(retry);
        errorPanel.setVisibility(View.GONE);
        content.addView(errorPanel);

        WebSettings options = web.getSettings();
        options.setUserAgentString(options.getUserAgentString() + " NTripAndroid/0.5");
        options.setJavaScriptEnabled(true);
        options.setDomStorageEnabled(true);
        options.setAllowFileAccess(false);
        options.setAllowContentAccess(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new TripWebClient());
        if (state == null || web.restoreState(state) == null) {
            web.loadUrl(HOME);
        } else if (state.getString("failed_url") != null) {
            showError(Uri.parse(state.getString("failed_url")));
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
    }

    private void openSettings() {
        startActivityForResult(new Intent(this, CollectorSettingsActivity.class), COLLECTOR_SETTINGS);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == COLLECTOR_SETTINGS && result == RESULT_OK) web.loadUrl(TripConnection.ORIGIN + "/trips");
    }

    private void selectTrip(long tripId) {
        final int choice = ++selection;
        final String cookie = TripConnection.sessionCookie();
        if (cookie.isEmpty()) {
            Toast.makeText(this, "먼저 앱에서 로그인해 주세요.", Toast.LENGTH_LONG).show();
            return;
        }
        progress = new AlertDialog.Builder(this).setMessage("여행에 카드 수집기를 연결하고 있어요…")
                .setNegativeButton("취소", (dialog, which) -> selection++)
                .setOnCancelListener(dialog -> selection++).show();
        pairing.execute(() -> {
            try {
                TripConnection connection = TripConnection.request(tripId, cookie);
                runOnUiThread(() -> {
                    if (!finishSelection(choice)) return;
                    if (!connection.activate(Sources.prefs(this))) {
                        showIssue("로그인이 변경됐어요. 여행을 다시 선택해 주세요.");
                        return;
                    }
                    CollectorStore.retry(this);
                    String note = connection.title + "에 연결했어요.";
                    if (!Sources.prefs(this).getBoolean("enabled", false) || !Sources.hasNotificationAccess(this)) {
                        note += " 카드 수집 설정에서 카드 앱과 알림 접근을 설정해 주세요.";
                    }
                    Toast.makeText(this, note, Toast.LENGTH_LONG).show();
                    web.loadUrl(TripConnection.ORIGIN + "/trips/" + tripId);
                });
            } catch (IOException | JSONException ex) {
                runOnUiThread(() -> {
                    if (!finishSelection(choice)) return;
                    showIssue(ex instanceof TripConnection.PairingIssue ? ex.getMessage()
                            : "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 선택해 주세요.");
                });
            }
        });
    }

    private boolean finishSelection(int choice) {
        if (choice != selection || isFinishing() || isDestroyed()) return false;
        if (progress != null) progress.dismiss();
        progress = null;
        return true;
    }

    private void showIssue(String message) {
        new AlertDialog.Builder(this).setMessage(message).setPositiveButton("확인", null).show();
    }

    private void showError(Uri uri) {
        trustedDocument = false;
        failedUrl = TripConnection.isSite(uri) ? uri.toString() : HOME;
        web.setVisibility(View.INVISIBLE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private final class TripWebClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (TripConnection.isSite(uri) && "POST".equals(request.getMethod())
                    && "/api/v1/auth/logout".equals(uri.getEncodedPath())) {
                // The web UI can finish local logout even when the server is unreachable.
                SharedPreferences prefs = Sources.prefs(MainActivity.this);
                TripConnection.invalidate(prefs, prefs.getString("token", ""));
            }
            return super.shouldInterceptRequest(view, request);
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (TripConnection.isSite(uri) && uri.getPath() != null && uri.getPath().startsWith("/_app/collector/")) {
                // Consume every reserved path, including malformed, subframe and script-only requests.
                String current = view.getUrl();
                if (!request.isForMainFrame() || !request.hasGesture() || !trustedDocument
                        || current == null || !TripConnection.isSite(Uri.parse(current))
                        || request.isRedirect() || !"GET".equals(request.getMethod())) return true;
                String path = uri.getEncodedPath();
                if ("/_app/collector/settings".equals(path)) openSettings();
                else if (path.matches("/_app/collector/connect/[1-9][0-9]{0,9}")) {
                    long id = Long.parseLong(uri.getLastPathSegment());
                    if (id <= Integer.MAX_VALUE) selectTrip(id);
                }
                return true;
            }
            if (!request.isForMainFrame() || TripConnection.isSite(uri)) return false;
            if (request.hasGesture() && "https".equalsIgnoreCase(uri.getScheme())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "링크를 열 브라우저가 없어요.", Toast.LENGTH_SHORT).show();
                }
            }
            return true;
        }

        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            trustedDocument = false;
            failedUrl = null;
            errorPanel.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
        }

        @Override public void onPageCommitVisible(WebView view, String url) {
            trustedDocument = TripConnection.isSite(Uri.parse(url)) && failedUrl == null;
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError(request.getUrl());
        }

        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame()) showError(request.getUrl());
        }
    }

    private void navigateBack() {
        if (web.canGoBack()) web.goBack();
        else finish();
    }

    // API 26–32 dispatch Back here; newer devices use the callback registered in onCreate.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        navigateBack();
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
        outState.putString("failed_url", failedUrl);
    }

    @Override protected void onDestroy() {
        selection++;
        if (progress != null) progress.dismiss();
        pairing.shutdownNow();
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
