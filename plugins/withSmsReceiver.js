const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withSmsReceiver = (config) => {
  // Add SMS permissions and receiver to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Add permissions
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ];

    permissions.forEach((permission) => {
      const exists = manifest['uses-permission'].some(
        (p) => p.$['android:name'] === permission
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    });

    // Add SMS receiver to application
    const application = manifest.application[0];
    if (!application.receiver) {
      application.receiver = [];
    }

    // SMS Receiver
    const smsReceiverExists = application.receiver.some(
      (r) => r.$['android:name'] === '.SmsReceiver'
    );

    if (!smsReceiverExists) {
      application.receiver.push({
        $: {
          'android:name': '.SmsReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' },
            action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }],
          },
        ],
      });
    }

    // Boot receiver to restart service after reboot
    const bootReceiverExists = application.receiver.some(
      (r) => r.$['android:name'] === '.BootReceiver'
    );

    if (!bootReceiverExists) {
      application.receiver.push({
        $: {
          'android:name': '.BootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }],
          },
        ],
      });
    }

    return config;
  });

  // Add native Java files
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packagePath = path.join(
        projectRoot,
        'android/app/src/main/java/com/personal/xpentrik'
      );

      // Create directory if it doesn't exist
      if (!fs.existsSync(packagePath)) {
        fs.mkdirSync(packagePath, { recursive: true });
      }

      // Write SmsReceiver.java
      const smsReceiverCode = `package com.personal.xpentrik;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "XpentrikSmsReceiver";
    private static final String PREFS_NAME = "XpentrikPrefs";
    private static final String PENDING_SMS_KEY = "pending_sms";

    // Bank patterns to detect transaction SMS
    private static final String[] BANK_PATTERNS = {
        "HDFC", "ICICI", "SBI", "AXIS", "KOTAK", "PNB", "BOI", "CANARA",
        "UNION", "IOB", "YES", "INDUS", "PAYTM", "GPAY", "PHONPE",
        "AMAZON", "CRED", "SLICE", "LAZYPAY"
    };

    private static final String[] TRANSACTION_KEYWORDS = {
        "spent", "debited", "credited", "sent", "received", "paid",
        "withdrawn", "rs.", "rs ", "inr", "₹"
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent.getAction() == null || 
            !intent.getAction().equals("android.provider.Telephony.SMS_RECEIVED")) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null || pdus.length == 0) return;

        String format = bundle.getString("format");

        for (Object pdu : pdus) {
            SmsMessage smsMessage;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu);
            }

            String sender = smsMessage.getDisplayOriginatingAddress();
            String body = smsMessage.getMessageBody();
            long timestamp = smsMessage.getTimestampMillis();

            Log.d(TAG, "SMS received from: " + sender);

            if (isTransactionSms(sender, body)) {
                Log.d(TAG, "Transaction SMS detected! Saving for processing...");
                savePendingSms(context, sender, body, timestamp);
            }
        }
    }

    private boolean isTransactionSms(String sender, String body) {
        if (sender == null || body == null) return false;

        String upperSender = sender.toUpperCase();
        String lowerBody = body.toLowerCase();

        // Check if from bank
        boolean isFromBank = false;
        for (String pattern : BANK_PATTERNS) {
            if (upperSender.contains(pattern)) {
                isFromBank = true;
                break;
            }
        }

        // Check for transaction keywords
        boolean hasTransactionKeyword = false;
        for (String keyword : TRANSACTION_KEYWORDS) {
            if (lowerBody.contains(keyword)) {
                hasTransactionKeyword = true;
                break;
            }
        }

        return isFromBank || hasTransactionKeyword;
    }

    private void savePendingSms(Context context, String sender, String body, long timestamp) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString(PENDING_SMS_KEY, "[]");
            
            JSONArray pendingArray = new JSONArray(existingJson);
            
            JSONObject smsObj = new JSONObject();
            smsObj.put("sender", sender);
            smsObj.put("body", body);
            smsObj.put("timestamp", timestamp);
            
            pendingArray.put(smsObj);
            
            // Keep only last 50 messages
            while (pendingArray.length() > 50) {
                pendingArray.remove(0);
            }
            
            prefs.edit().putString(PENDING_SMS_KEY, pendingArray.toString()).apply();
            Log.d(TAG, "SMS saved to pending queue. Total pending: " + pendingArray.length());
        } catch (Exception e) {
            Log.e(TAG, "Error saving SMS: " + e.getMessage());
        }
    }
}`;

      fs.writeFileSync(path.join(packagePath, 'SmsReceiver.java'), smsReceiverCode);

      // Write BootReceiver.java
      const bootReceiverCode = `package com.personal.xpentrik;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "XpentrikBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device booted - Xpentrik SMS receiver is active");
        }
    }
}`;

      fs.writeFileSync(path.join(packagePath, 'BootReceiver.java'), bootReceiverCode);

      // Write SmsModule.java for React Native bridge
      const smsModuleCode = `package com.personal.xpentrik;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Telephony;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import org.json.JSONArray;
import org.json.JSONObject;

public class SmsModule extends ReactContextBaseJavaModule {
    private static final String PREFS_NAME = "XpentrikPrefs";
    private static final String PENDING_SMS_KEY = "pending_sms";
    private final ReactApplicationContext reactContext;

    // Bank patterns to detect transaction SMS
    private static final String[] BANK_PATTERNS = {
        "HDFC", "ICICI", "SBI", "AXIS", "KOTAK", "PNB", "BOI", "CANARA",
        "UNION", "IOB", "YES", "INDUS", "PAYTM", "GPAY", "PHONPE",
        "AMAZON", "CRED", "SLICE", "LAZYPAY"
    };

    private static final String[] TRANSACTION_KEYWORDS = {
        "spent", "debited", "credited", "sent", "received", "paid",
        "withdrawn", "rs.", "rs ", "inr"
    };

    public SmsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "SmsModule";
    }

    @ReactMethod
    public void checkPermission(Promise promise) {
        try {
            boolean hasReadPermission = ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.READ_SMS
            ) == PackageManager.PERMISSION_GRANTED;
            
            boolean hasReceivePermission = ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.RECEIVE_SMS
            ) == PackageManager.PERMISSION_GRANTED;
            
            promise.resolve(hasReadPermission && hasReceivePermission);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getPendingSms(Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String pendingJson = prefs.getString(PENDING_SMS_KEY, "[]");
            
            JSONArray pendingArray = new JSONArray(pendingJson);
            WritableArray result = Arguments.createArray();
            
            for (int i = 0; i < pendingArray.length(); i++) {
                JSONObject smsObj = pendingArray.getJSONObject(i);
                WritableMap smsMap = Arguments.createMap();
                smsMap.putString("sender", smsObj.getString("sender"));
                smsMap.putString("body", smsObj.getString("body"));
                smsMap.putDouble("timestamp", smsObj.getLong("timestamp"));
                result.pushMap(smsMap);
            }
            
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void clearPendingSms(Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(PENDING_SMS_KEY, "[]").apply();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getTransactionSms(int days, Promise promise) {
        try {
            if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.READ_SMS)
                    != PackageManager.PERMISSION_GRANTED) {
                promise.reject("PERMISSION_DENIED", "SMS permission not granted");
                return;
            }

            WritableArray result = Arguments.createArray();
            ContentResolver contentResolver = reactContext.getContentResolver();
            
            // Calculate date range (last N days)
            long minDate = System.currentTimeMillis() - ((long) days * 24 * 60 * 60 * 1000);
            
            String selection = Telephony.Sms.DATE + " > ?";
            String[] selectionArgs = new String[]{String.valueOf(minDate)};

            Cursor cursor = contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                new String[]{
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE
                },
                selection,
                selectionArgs,
                Telephony.Sms.DATE + " DESC LIMIT 500"
            );

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String address = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS));
                    String body = cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms.BODY));
                    long date = cursor.getLong(cursor.getColumnIndexOrThrow(Telephony.Sms.DATE));
                    
                    // Check if it's a transaction SMS
                    if (isTransactionSms(address, body)) {
                        WritableMap smsMap = Arguments.createMap();
                        smsMap.putString("id", cursor.getString(cursor.getColumnIndexOrThrow(Telephony.Sms._ID)));
                        smsMap.putString("sender", address != null ? address : "");
                        smsMap.putString("body", body != null ? body : "");
                        smsMap.putDouble("timestamp", date);
                        result.pushMap(smsMap);
                    }
                }
                cursor.close();
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    private boolean isTransactionSms(String sender, String body) {
        if (sender == null || body == null) return false;

        String upperSender = sender.toUpperCase();
        String lowerBody = body.toLowerCase();

        // Check if from bank
        boolean isFromBank = false;
        for (String pattern : BANK_PATTERNS) {
            if (upperSender.contains(pattern)) {
                isFromBank = true;
                break;
            }
        }

        // Check for transaction keywords
        boolean hasTransactionKeyword = false;
        for (String keyword : TRANSACTION_KEYWORDS) {
            if (lowerBody.contains(keyword)) {
                hasTransactionKeyword = true;
                break;
            }
        }

        return isFromBank || hasTransactionKeyword;
    }
}`;

      fs.writeFileSync(path.join(packagePath, 'SmsModule.java'), smsModuleCode);

      // Write SmsPackage.java
      const smsPackageCode = `package com.personal.xpentrik;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class SmsPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new SmsModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}`;

      fs.writeFileSync(path.join(packagePath, 'SmsPackage.java'), smsPackageCode);

      return config;
    },
  ]);

  // Register SmsPackage in MainApplication.kt
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const mainApplicationPath = path.join(
        projectRoot,
        'android/app/src/main/java/com/personal/xpentrik/MainApplication.kt'
      );

      if (fs.existsSync(mainApplicationPath)) {
        let mainApplicationCode = fs.readFileSync(mainApplicationPath, 'utf8');

        // Check if SmsPackage is already imported
        if (!mainApplicationCode.includes('import com.personal.xpentrik.SmsPackage')) {
          // Add import after other imports
          const importPattern = /(import expo\.modules\.ReactNativeHostWrapper)/;
          mainApplicationCode = mainApplicationCode.replace(
            importPattern,
            `$1\nimport com.personal.xpentrik.SmsPackage`
          );
        }

        // Check if SmsPackage is already added to packages
        if (!mainApplicationCode.includes('add(SmsPackage())')) {
          // Add SmsPackage to the packages list
          const packagesPattern = /(PackageList\(this\)\.packages\.apply \{[^}]*)(\/\/ Packages that cannot be autolinked)/;
          if (packagesPattern.test(mainApplicationCode)) {
            mainApplicationCode = mainApplicationCode.replace(
              packagesPattern,
              `$1\n              add(SmsPackage())\n              $2`
            );
          } else {
            // Fallback: add after PackageList line
            const packageListPattern = /(PackageList\(this\)\.packages\.apply \{)/;
            mainApplicationCode = mainApplicationCode.replace(
              packageListPattern,
              `$1\n              add(SmsPackage())`
            );
          }
        }

        fs.writeFileSync(mainApplicationPath, mainApplicationCode);
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withSmsReceiver;
