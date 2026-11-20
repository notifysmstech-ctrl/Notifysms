package com.relaysms.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.telephony.SmsManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;

@CapacitorPlugin(
  name = "SmsBridge",
  permissions = {
    @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms")
  }
)
public class SmsBridgePlugin extends Plugin {
  @PluginMethod
  public void sendNativeSms(PluginCall call) {
    String phone = call.getString("phone");
    String message = call.getString("message");

    if (phone == null || phone.isEmpty() || message == null || message.isEmpty()) {
      call.reject("Phone and message are required");
      return;
    }

    if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS)
        != PackageManager.PERMISSION_GRANTED) {
      requestPermissionForAlias("sms", call, "smsPermissionCallback");
      return;
    }

    try {
      SmsManager smsManager = getContext().getSystemService(SmsManager.class);
      ArrayList<String> parts = smsManager.divideMessage(message);
      smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
      JSObject ret = new JSObject();
      ret.put("sent", true);
      ret.put("parts", parts.size());
      call.resolve(ret);
    } catch (Exception ex) {
      call.reject("Native SIM dispatch failed: " + ex.getMessage());
    }
  }
}
