import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/api_client.dart';
import '../models/farmer_model.dart';
import '../constants/app_constants.dart';

enum AuthStatus { loading, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final Farmer? farmer;
  final String? error;

  const AuthState({
    required this.status,
    this.farmer,
    this.error,
  });

  const AuthState.loading() : this(status: AuthStatus.loading);
  const AuthState.unauthenticated() : this(status: AuthStatus.unauthenticated);
  const AuthState.authenticated(Farmer farmer)
      : this(status: AuthStatus.authenticated, farmer: farmer);

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isLoading => status == AuthStatus.loading;
  bool get needsProfile => isAuthenticated && !(farmer?.isProfileComplete ?? false);
}

class AuthNotifier extends AsyncNotifier<AuthState> {
  ApiClient get _api => ref.read(apiClientProvider);

  @override
  Future<AuthState> build() async {
    return await _checkAuth();
  }

  Future<AuthState> _checkAuth() async {
    try {
      final token = await _api.getToken();
      if (token == null) return const AuthState.unauthenticated();

      final data = await _api.farmerGetMe();
      final farmer = Farmer.fromJson(data);
      await _cacheFarmer(farmer);
      return AuthState.authenticated(farmer);
    } catch (_) {
      await _api.clearToken();
      return const AuthState.unauthenticated();
    }
  }

  Future<void> requestOtp(String phone) async {
    await _api.farmerRequestOtp(phone);
  }

  Future<({bool isNewUser, Farmer farmer})> verifyOtp(
      String phone, String otp) async {
    final data = await _api.farmerVerifyOtp(phone, otp);
    final farmer = Farmer.fromJson(data['farmer'] as Map<String, dynamic>);
    final isNewUser = data['isNewUser'] as bool? ?? false;
    await _cacheFarmer(farmer);
    state = AsyncValue.data(AuthState.authenticated(farmer));
    return (isNewUser: isNewUser, farmer: farmer);
  }

  Future<void> updateProfile(Map<String, dynamic> profileData) async {
    final data = await _api.farmerUpdateProfile(profileData);
    final farmer = Farmer.fromJson(data);
    await _cacheFarmer(farmer);
    state = AsyncValue.data(AuthState.authenticated(farmer));
  }

  Future<void> refreshProfile() async {
    try {
      final data = await _api.farmerGetMe();
      final farmer = Farmer.fromJson(data);
      await _cacheFarmer(farmer);
      state = AsyncValue.data(AuthState.authenticated(farmer));
    } catch (_) {}
  }

  Future<void> uploadAvatarDataUrl(String dataUrl) async {
    final data = await _api.uploadFarmerAvatarDataUrl(dataUrl);
    final farmer = Farmer.fromJson(data);
    await _cacheFarmer(farmer);
    state = AsyncValue.data(AuthState.authenticated(farmer));
  }

  Future<void> logout() async {
    await _api.clearToken();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.farmerKey);
    state = const AsyncValue.data(AuthState.unauthenticated());
  }

  Future<void> _cacheFarmer(Farmer farmer) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.farmerKey, jsonEncode(farmer.toJson()));
  }
}

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

// Convenience provider for current farmer
final currentFarmerProvider = Provider<Farmer?>((ref) {
  final authState = ref.watch(authProvider);
  return authState.valueOrNull?.farmer;
});
