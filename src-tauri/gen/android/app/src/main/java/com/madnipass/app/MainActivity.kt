package com.madnipass.app

import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

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
    
    val rootView = window.decorView.findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
      val statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars())
      val navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      view.updatePadding(
        top = statusBars.top,
        bottom = navigationBars.bottom
      )
      insets
    }
  }
}
