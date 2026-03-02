import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

final ImagePicker _picker = ImagePicker();

Future<String?> pickAvatarDataUrl() async {
  try {
    // Native platforms (Android/iOS/desktop) pick from gallery.
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 90,
    );
    if (picked == null) return null;

    final bytes = await picked.readAsBytes();
    if (bytes.isEmpty) return null;

    final mimeType = _resolveImageMimeType(picked);
    final encoded = base64Encode(bytes);
    return 'data:$mimeType;base64,$encoded';
  } on MissingPluginException {
    throw Exception(
      'Image picker is unavailable. Please fully restart the app and try again.',
    );
  } on PlatformException catch (e) {
    if (e.code == 'channel-error') {
      throw Exception(
        'Image picker connection failed. Please close and reopen the app.',
      );
    }
    throw Exception(e.message ?? 'Unable to open gallery.');
  }
}

String _resolveImageMimeType(XFile file) {
  final explicit = file.mimeType?.toLowerCase().trim();
  if (explicit != null && explicit.startsWith('image/')) {
    return explicit;
  }

  final path = file.path.toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';

  // Backend supports JPG/PNG/WEBP; default to JPEG when mime metadata is absent.
  return 'image/jpeg';
}
