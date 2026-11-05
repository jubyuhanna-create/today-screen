package com.el7ajb.today

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var web: WebView
    private var recorder: VoiceRecorder? = null
    private val main = Handler(Looper.getMainLooper())
    private val maxRecording = Runnable { stopRecording() }
    private val retry = Runnable { web.loadUrl(BuildConfig.DASHBOARD_URL) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            isFocusable = true
            isFocusableInTouchMode = true
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String) {
                    CookieManager.getInstance().flush()
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    // No internet yet (common right after boot). Try again in 10 seconds.
                    if (request.isForMainFrame) {
                        main.removeCallbacks(retry)
                        main.postDelayed(retry, 10_000)
                    }
                }
            }
            addJavascriptInterface(Bridge(), "TodayNative")
        }
        CookieManager.getInstance().setAcceptCookie(true)
        setContentView(web)
        web.loadUrl(BuildConfig.DASHBOARD_URL)

        if (!hasMic()) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
    }

    inner class Bridge {
        @JavascriptInterface
        fun toggle() { main.post { toggleRecording() } }
    }

    // The remote: OK talks, Back cancels a recording, Menu reloads the page.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A -> {
                if (event.action == KeyEvent.ACTION_UP) toggleRecording()
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                if (event.action == KeyEvent.ACTION_UP && recorder != null) cancelRecording()
                return true // the screen stays up; the Home button still leaves
            }
            KeyEvent.KEYCODE_MENU -> {
                if (event.action == KeyEvent.ACTION_UP) web.reload()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun toggleRecording() {
        if (recorder == null) startRecording() else stopRecording()
    }

    private fun startRecording() {
        if (!hasMic()) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
            js("window.__today&&window.__today.error('Allow the microphone, then press OK again')")
            return
        }
        val r = VoiceRecorder(
            onLevel = { lvl -> main.post { js("window.__today&&window.__today.level(${"%.2f".format(java.util.Locale.US, lvl)})") } },
            onSilence = { main.post { if (recorder != null && (recorder?.seconds() ?: 0f) > 1f) stopRecording() } },
            onNoInput = { main.post { if (recorder != null) { cancelRecording(); js("window.__today&&window.__today.error('No sound from the remote mic. Use your phone instead')") } } },
        )
        if (!r.start()) {
            js("window.__today&&window.__today.error('The microphone is busy or not available')")
            return
        }
        recorder = r
        js("window.__today&&window.__today.listening()")
        main.postDelayed(maxRecording, 45_000)
    }

    private fun stopRecording() {
        val r = recorder ?: return
        recorder = null
        main.removeCallbacks(maxRecording)
        Thread {
            val seconds = r.seconds()
            val wav = r.stop()
            if (seconds < 0.6f) {
                main.post { js("window.__today&&window.__today.cancel()") }
                return@Thread
            }
            val b64 = Base64.encodeToString(wav, Base64.NO_WRAP)
            main.post { js("window.__today&&window.__today.audio('$b64','audio/wav')") }
        }.start()
    }

    private fun cancelRecording() {
        val r = recorder ?: return
        recorder = null
        main.removeCallbacks(maxRecording)
        Thread { r.cancel() }.start()
        js("window.__today&&window.__today.cancel()")
    }

    private fun js(code: String) = web.evaluateJavascript(code, null)

    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    override fun onResume() {
        super.onResume()
        hideSystemUi()
        web.onResume()
    }

    override fun onPause() {
        cancelRecording()
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }
}
