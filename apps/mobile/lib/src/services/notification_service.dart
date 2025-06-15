import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/main.dart';
import 'package:tenacity/src/ui/announcement_details_screen.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';

// Top-level function to handle background messages.
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  persistentDebugLog("Handling a background message: ${message.messageId}");
}

// A callback type for when a device token is updated.
typedef TokenCallback = Function(String);
TokenCallback? _onTokenUpdate;

Future<void> persistentDebugLog(String message) async {
  final prefs = await SharedPreferences.getInstance();
  final logs = prefs.getStringList('debug_logs') ?? [];
  logs.add('${DateTime.now().toIso8601String()}: $message');
  await prefs.setStringList('debug_logs', logs);
}

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

  static Map<String, dynamic>? _pendingNotificationData;

  static void setPendingNotification(Map<String, dynamic> data) {
    _pendingNotificationData = data;
  }

  static Map<String, dynamic>? takePendingNotification() {
    final data = _pendingNotificationData;
    _pendingNotificationData = null;
    return data;
  }

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
    persistentDebugLog("Device Token: $deviceToken");

    // Listen for token refresh.
    _messaging.onTokenRefresh.listen((String newToken) {
      deviceToken = newToken;
      if (_onTokenUpdate != null) {
        _onTokenUpdate!(newToken);
      }
      final user = FirebaseAuth.instance.currentUser;
      if (user != null) {
        saveTokenToFirestore(user.uid);
      }
    });

    // Save initial token if user is logged in
    final user = FirebaseAuth.instance.currentUser;
    if (user != null && deviceToken != null) {
      await saveTokenToFirestore(user.uid);
    }

    // Initialize local notifications.
    await _initializeLocalNotifications();

    // Listen for foreground messages.
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      persistentDebugLog("Received a foreground message: ${message.data}");
      _showLocalNotification(message);
    });

    // Handle notification taps when app is in background
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      persistentDebugLog("App opened from background by notification");
      persistentDebugLog("Raw message data: ${message.data}");
      persistentDebugLog(
          "Message notification: ${message.notification?.title}, ${message.notification?.body}");

      // Ensure the data format is correct
      final Map<String, dynamic> data = {
        ...message.data,
        if (message.data['type'] == null && message.notification != null)
          'type': 'announcement',
      };

      handleNotificationTap(data);
    });

    // Handle notification taps when app was terminated
    FirebaseMessaging.instance
        .getInitialMessage()
        .then((RemoteMessage? message) {
      if (message != null) {
        persistentDebugLog(
            "App launched from terminated state by notification: ${message.data}");
        // Store for later processing
        setPendingNotification(message.data);
      }
    });

    // Register the background message handler.
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  void handleNotificationTap(Map<String, dynamic> data) async {
    await persistentDebugLog("handleNotificationTap called with data: $data");
    final context = navigatorKey.currentContext;
    if (context == null) {
      await persistentDebugLog("Navigator context is null, cannot navigate.");
      return;
    }

    await persistentDebugLog(
        "Available keys in notification data: ${data.keys.toList()}");

    final String? type = data['type'];
    await persistentDebugLog("Notification type: $type");

    if (type == "announcement") {
      final String? announcementId = data['announcementId'];
      await persistentDebugLog("Announcement ID: $announcementId");

      if (announcementId != null) {
        await persistentDebugLog("Calling _navigateToAnnouncement...");
        try {
          _navigateToAnnouncement(announcementId);
          await persistentDebugLog("_navigateToAnnouncement completed.");
        } catch (e, stack) {
          await persistentDebugLog(
              "Exception in _navigateToAnnouncement: $e\n$stack");
        }
      } else {
        await persistentDebugLog("Cannot navigate: announcementId is null");
      }
    } else if (type == "chat_message") {
      await persistentDebugLog("Attempting to navigate to chat screen...");
      final String? chatId = data['chatId'] as String?;
      final String? otherUserName = data['otherUserName'] as String?;
      if (chatId != null && otherUserName != null) {
        try {
          await persistentDebugLog("Navigator.of(context).push(ChatScreen...)");
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => ChatScreen(
                chatId: chatId,
                otherUserName: otherUserName,
              ),
            ),
          );
          await persistentDebugLog("Navigation to chat screen succeeded.");
        } catch (e, stack) {
          await persistentDebugLog(
              "Exception during chat navigation: $e\n$stack");
        }
      } else {
        await persistentDebugLog(
            "Cannot open chat: chatId or otherUserName is null or context unavailable");
      }
    } else if (type == "lesson_reminder" || type == "shift_reminder") {
      await persistentDebugLog("Selecting tab 1 for lesson/shift reminder.");
      try {
        homeScreenKey.currentState?.selectTab(1);
        await persistentDebugLog("Tab 1 selected.");
      } catch (e, stack) {
        await persistentDebugLog("Exception selecting tab 1: $e\n$stack");
      }
    } else if (type == "feedback") {
      await persistentDebugLog("Attempting to navigate to feedback screen...");
      try {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => FeedbackScreen(
              studentId: data['studentId'] as String,
            ),
          ),
        );
        await persistentDebugLog("Navigation to feedback screen succeeded.");
      } catch (e, stack) {
        await persistentDebugLog(
            "Exception during feedback navigation: $e\n$stack");
      }
    } else if (type == "invoice_reminder") {
      await persistentDebugLog("Selecting tab 4 for invoice reminder.");
      try {
        homeScreenKey.currentState?.selectTab(4);
        await persistentDebugLog("Tab 4 selected.");
      } catch (e, stack) {
        await persistentDebugLog("Exception selecting tab 4: $e\n$stack");
      }
    } else if (type == "cancellation") {
      await persistentDebugLog("Selecting tab 1 for cancellation.");
      try {
        homeScreenKey.currentState?.selectTab(1);
        await persistentDebugLog("Tab 1 selected.");
      } catch (e, stack) {
        await persistentDebugLog("Exception selecting tab 1: $e\n$stack");
      }
    } else {
      await persistentDebugLog("Unknown notification type: $type");
    }
  }

  // Extract navigation to a separate method
  void _navigateToAnnouncement(String announcementId) async {
    await persistentDebugLog("Navigating to announcement: $announcementId");
    try {
      Navigator.of(navigatorKey.currentContext!).push(
        MaterialPageRoute(
          builder: (context) => AnnouncementDetailsScreen(
            announcementId: announcementId,
          ),
        ),
      );
      await persistentDebugLog("Navigation to announcement screen succeeded.");
    } catch (e, stack) {
      await persistentDebugLog(
          "Exception during announcement navigation: $e\n$stack");
    }
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
    persistentDebugLog(
        'User granted permission: ${settings.authorizationStatus}');
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
        final String? payload = notificationResponse.payload;
        persistentDebugLog("Notification tapped with payload: $payload");

        // If you expect a JSON payload, decode it for further actions.
        if (payload != null && payload.isNotEmpty) {
          try {
            final Map<String, dynamic> data = jsonDecode(payload);
            handleNotificationTap(data);
          } catch (e) {
            persistentDebugLog("Error parsing notification payload: $e");
          }
        }
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
        payload: jsonEncode(message.data),
      );
    }
  }

  /// Saves or updates the device token in Firestore
  Future<void> saveTokenToFirestore(String userId) async {
    if (deviceToken == null) return;

    // Update the userTokens document to include the uid field.
    await FirebaseFirestore.instance
        .collection('userTokens')
        .doc(userId)
        .set({'uid': userId}, SetOptions(merge: true));

    final tokenDoc = FirebaseFirestore.instance
        .collection('userTokens')
        .doc(userId)
        .collection('tokens')
        .doc(deviceToken);

    await tokenDoc.set({
      'token': deviceToken,
      'createdAt': FieldValue.serverTimestamp(),
      'platform': defaultTargetPlatform.toString(),
    });
  }

  /// Removes the device token from Firestore
  Future<void> removeTokenFromFirestore(String userId) async {
    if (deviceToken == null) return;

    await FirebaseFirestore.instance
        .collection('userTokens')
        .doc(userId)
        .collection('tokens')
        .doc(deviceToken)
        .delete();
  }
}
