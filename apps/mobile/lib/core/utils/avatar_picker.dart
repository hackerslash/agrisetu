import 'avatar_picker_stub.dart' if (dart.library.html) 'avatar_picker_web.dart'
    as impl;

Future<String?> pickAvatarDataUrl() => impl.pickAvatarDataUrl();
