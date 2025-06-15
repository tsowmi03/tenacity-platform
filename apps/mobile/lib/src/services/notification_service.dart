import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:tenacity/main.dart';
import 'package:tenacity/src/ui/announcement_details_screen.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';

// Top-level function to handle background messages.
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
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
      _showLocalNotification(message);
    });

    // Handle notification taps when app is in background
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
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
        // Store for later processing
        setPendingNotification(message.data);
      }
    });

    // Register the background message handler.
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  void handleNotificationTap(Map<String, dynamic> data) async {
    final context = navigatorKey.currentContext;
    if (context == null) {
      return;
    }

    final String? type = data['type'];

    if (type == "announcement") {
      final String? announcementId = data['announcementId'];
      if (announcementId != null) {
        try {
          _navigateToAnnouncement(announcementId);
        } catch (e) {
          debugPrint('Error navigating to announcement: $e');
        }
      }
    } else if (type == "chat_message") {
      final String? chatId = data['chatId'] as String?;
      final String? otherUserName = data['otherUserName'] as String?;
      if (chatId != null && otherUserName != null) {
        try {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => ChatScreen(
                chatId: chatId,
                otherUserName: otherUserName,
              ),
            ),
          );
        } catch (e) {
          debugPrint('Error navigating to chat: $e');
        }
      }
    } else if (type == "lesson_reminder" || type == "shift_reminder") {
      try {
        homeScreenKey.currentState?.selectTab(1);
      } catch (e) {
        debugPrint('Error selecting tab for reminder: $e');
      }
    } else if (type == "feedback") {
      try {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => FeedbackScreen(
              studentId: data['studentId'] as String,
            ),
          ),
        );
      } catch (e) {
        debugPrint('Error navigating to feedback: $e');
      }
    } else if (type == "invoice_reminder") {
      try {
        homeScreenKey.currentState?.selectTab(4);
      } catch (e) {
        debugPrint('Error selecting tab for invoice reminder: $e');
      }
    } else if (type == "cancellation") {
      try {
        homeScreenKey.currentState?.selectTab(1);
      } catch (e) {
        debugPrint('Error selecting tab for cancellation: $e');
      }
    }
  }

  // Extract navigation to a separate method
  void _navigateToAnnouncement(String announcementId) async {
    try {
      Navigator.of(navigatorKey.currentContext!).push(
        MaterialPageRoute(
          builder: (context) => AnnouncementDetailsScreen(
            announcementId: announcementId,
          ),
        ),
      );
    } catch (e) {
      debugPrint('Error navigating to announcement: $e');
    }
  }

  // Sets the callback to be invoked when the device token is updated.
  void setTokenCallback(TokenCallback callback) {
    _onTokenUpdate = callback;
  }

  // Requests notification permissions from the user.
  Future<void> _requestPermissions() async {
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
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

        // If you expect a JSON payload, decode it for further actions.
        if (payload != null && payload.isNotEmpty) {
          try {
            final Map<String, dynamic> data = jsonDecode(payload);
            handleNotificationTap(data);
          } catch (e) {
            debugPrint('Error decoding notification payload: $e');
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
