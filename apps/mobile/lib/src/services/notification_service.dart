import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// Top-level function to handle background messages.
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint("Handling a background message: ${message.messageId}");
}

// A callback type for when a device token is updated.
typedef TokenCallback = Function(String);
TokenCallback? _onTokenUpdate;

class NotificationService {
  // Singleton instance
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _flutterLocalNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  // Store the device token
  String? deviceToken;

  /// Initializes the notification service.
  Future<void> initialize() async {
    await _requestPermissions();

    // On iOS, retrieve the APNs token.
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await _messaging.getAPNSToken();
    }

    // Retrieve the device token.
    deviceToken = await _messaging.getToken();
    if (deviceToken != null && _onTokenUpdate != null) {
      _onTokenUpdate!(deviceToken!);
    }
    debugPrint("Device Token: $deviceToken");

    // Listen for token refresh.
    _messaging.onTokenRefresh.listen((String newToken) {
      deviceToken = newToken;
      if (_onTokenUpdate != null) {
        _onTokenUpdate!(newToken);
      }
    });

    // Initialize local notifications.
    await _initializeLocalNotifications();

    // Listen for foreground messages.
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint("Received a foreground message: ${message.messageId}");
      _showLocalNotification(message);
    });

    // Register the background message handler.
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  // Sets the callback to be invoked when the device token is updated.
  void setTokenCallback(TokenCallback callback) {
    _onTokenUpdate = callback;
  }

  // Requests notification permissions from the user.
  Future<void> _requestPermissions() async {
    NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    debugPrint('User granted permission: ${settings.authorizationStatus}');
  }

  /// Initializes the local notifications plugin.
  Future<void> _initializeLocalNotifications() async {
    // Android initialization settings.
    const AndroidInitializationSettings androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    // iOS initialization settings.
    const DarwinInitializationSettings iosSettings =
        DarwinInitializationSettings();

    // Combined initialization settings.
    const InitializationSettings initSettings =
        InitializationSettings(android: androidSettings, iOS: iosSettings);

    await _flutterLocalNotificationsPlugin.initialize(
      initSettings,
      onDidReceiveNotificationResponse:
          (NotificationResponse notificationResponse) async {
        // TODO: Handle notification tap logic here.
        debugPrint("Notification payload: ${notificationResponse.payload}");
      },
    );
  }

  /// Displays a local notification for a received remote message.
  Future<void> _showLocalNotification(RemoteMessage message) async {
    RemoteNotification? notification = message.notification;
    AndroidNotification? android = message.notification?.android;

    if (notification != null && android != null) {
      const AndroidNotificationDetails androidDetails =
          AndroidNotificationDetails(
        'channel_id', // Replace with channel id.
        'channel_name', // Replace with channel name.
        channelDescription:
            'channel_description', // Replace with channel description.
        importance: Importance.max,
        priority: Priority.high,
      );

      const NotificationDetails platformDetails =
          NotificationDetails(android: androidDetails);

      await _flutterLocalNotificationsPlugin.show(
        notification.hashCode,
        notification.title,
        notification.body,
        platformDetails,
        payload: message.data['payload'] ?? '',
      );
    }
  }
}
