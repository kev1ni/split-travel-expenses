package kr.trip.collector;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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

public final class MainActivity extends Activity {
    private static final String HOST = "split-travel-expenses.vercel.app";
    private static final String HOME = "https://" + HOST + "/";
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
        settings.setOnClickListener(v -> startActivity(new Intent(this, CollectorSettingsActivity.class)));
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

    private static boolean isTripSite(Uri uri) {
        String authority = uri.getEncodedAuthority();
        return "https".equalsIgnoreCase(uri.getScheme())
                && (HOST.equalsIgnoreCase(authority) || (HOST + ":443").equalsIgnoreCase(authority));
    }

    private void showError(Uri uri) {
        failedUrl = isTripSite(uri) ? uri.toString() : HOME;
        web.setVisibility(View.INVISIBLE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private final class TripWebClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!request.isForMainFrame() || isTripSite(uri)) return false;
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
            failedUrl = null;
            errorPanel.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
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
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
