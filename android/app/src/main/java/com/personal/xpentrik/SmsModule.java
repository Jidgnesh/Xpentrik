package com.personal.xpentrik;

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
}