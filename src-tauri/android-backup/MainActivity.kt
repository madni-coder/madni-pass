package com.lazynote.webiste

import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var wv: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    wv = webView
    super.onWebViewCreate(webView)
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode == KeyEvent.KEYCODE_BACK) {
      wv?.let {
        it.evaluateJavascript("window.dispatchEvent(new CustomEvent('android-back-button', { cancelable: true }));", null)
        return true
      }
    }
    return super.onKeyDown(keyCode, event)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
