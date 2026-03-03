import 'dart:io';
void main() {
  final file = File('apps/mobile/pubspec.yaml');
  var content = file.readAsStringSync();
  if (!content.contains('flutter_localizations:')) {
    content = content.replaceFirst('shared_preferences: ^2.3.4', 'shared_preferences: ^2.3.4\n  flutter_localizations:\n    sdk: flutter');
  }
  if (!content.contains('generate: true')) {
    content = content.replaceFirst('uses-material-design: true', 'uses-material-design: true\n  generate: true');
  }
  file.writeAsStringSync(content);
}
