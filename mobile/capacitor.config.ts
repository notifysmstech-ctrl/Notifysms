const config = {
  appId: 'com.relaysms.app',
  appName: 'RelaySMS',
  webDir: 'www',
  server: {
    url: '{{RELAYSMS_SERVER_URL}}',
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
