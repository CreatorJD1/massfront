package com.creatorjd.massfront;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MassfrontBillingPlugin.class);
        super.onCreate(savedInstanceState);
        /* RTS matches last minutes. Without this the WebView follows the
           system screen-timeout and freezes mid-battle. FLAG_KEEP_SCREEN_ON
           does not need the WAKE_LOCK permission. */
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
