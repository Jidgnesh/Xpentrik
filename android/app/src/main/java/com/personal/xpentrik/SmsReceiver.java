package com.personal.xpentrik;

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
}