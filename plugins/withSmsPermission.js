const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

const withSmsPermission = (config) => {
  // Add SMS permissions to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Add permissions
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
      'android.permission.FOREGROUND_SERVICE',
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

    // Add SMS receiver
    const application = manifest.application[0];
    if (!application.receiver) {
      application.receiver = [];
    }

    const receiverExists = application.receiver.some(
      (r) => r.$['android:name'] === '.SmsReceiver'
    );

    if (!receiverExists) {
      application.receiver.push({
        $: {
          'android:name': '.SmsReceiver',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }],
          },
        ],
      });
    }

    return config;
  });

  return config;
};

module.exports = withSmsPermission;

