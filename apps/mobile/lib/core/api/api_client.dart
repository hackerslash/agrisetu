import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/app_constants.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  @override
  String toString() => message;
}

class ApiClient {
  static ApiClient? _instance;
  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: AppConstants.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: AppConstants.tokenKey);
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onResponse: (response, handler) {
        handler.next(response);
      },
      onError: (error, handler) {
        if (error.response?.statusCode == 401) {
          _storage.delete(key: AppConstants.tokenKey);
        }
        handler.next(error);
      },
    ));
  }

  static ApiClient get instance {
    _instance ??= ApiClient._internal();
    return _instance!;
  }

  Future<String?> getToken() => _storage.read(key: AppConstants.tokenKey);
  Future<void> setToken(String token) =>
      _storage.write(key: AppConstants.tokenKey, value: token);
  Future<void> clearToken() => _storage.delete(key: AppConstants.tokenKey);

  dynamic _handleResponse(Response response) {
    final data = response.data;
    if (data is Map && data['success'] == true) {
      return data['data'];
    }
    throw ApiException(
      data is Map ? (data['error'] as String? ?? 'Unknown error') : 'Unknown error',
      statusCode: response.statusCode,
    );
  }

  ApiException _handleError(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const ApiException('Connection timed out. Please try again.');
    }
    if (e.type == DioExceptionType.connectionError) {
      return const ApiException('No internet connection. Please check your network.');
    }
    final data = e.response?.data;
    final message = data is Map
        ? (data['error'] as String? ?? 'Server error')
        : 'Server error';
    return ApiException(message, statusCode: e.response?.statusCode);
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> farmerRequestOtp(String phone) async {
    try {
      final res = await _dio.post('/auth/farmer/request-otp', data: {'phone': phone});
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> farmerVerifyOtp(String phone, String otp) async {
    try {
      final res = await _dio.post('/auth/farmer/verify-otp', data: {'phone': phone, 'otp': otp});
      final data = _handleResponse(res) as Map<String, dynamic>;
      if (data['token'] != null) {
        await setToken(data['token'] as String);
      }
      return data;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> farmerGetMe() async {
    try {
      final res = await _dio.get('/auth/farmer/me');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> farmerUpdateProfile(Map<String, dynamic> data) async {
    try {
      final res = await _dio.post('/auth/farmer/profile', data: data);
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> data) async {
    try {
      final res = await _dio.post('/farmer/orders', data: data);
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<List<dynamic>> getOrders() async {
    try {
      final res = await _dio.get('/farmer/orders');
      return _handleResponse(res) as List<dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> getOrder(String orderId) async {
    try {
      final res = await _dio.get('/farmer/orders/$orderId');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Clusters ────────────────────────────────────────────────────────────────

  Future<List<dynamic>> getClusters({String? crop}) async {
    try {
      final res = await _dio.get(
        '/farmer/clusters',
        queryParameters: crop != null ? {'crop': crop} : null,
      );
      return _handleResponse(res) as List<dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> getCluster(String clusterId) async {
    try {
      final res = await _dio.get('/farmer/clusters/$clusterId');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> joinCluster(
      String clusterId, String orderId, double quantity) async {
    try {
      final res = await _dio.post('/farmer/clusters/$clusterId/join', data: {
        'orderId': orderId,
        'quantity': quantity,
      });
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> voteOnBid(
      String clusterId, String vendorBidId) async {
    try {
      final res = await _dio.post('/farmer/clusters/$clusterId/vote', data: {
        'vendorBidId': vendorBidId,
      });
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Payments ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> initiatePayment(String clusterId) async {
    try {
      final res = await _dio.post('/farmer/payments/initiate', data: {
        'clusterId': clusterId,
      });
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> confirmPayment(
      String clusterId, String upiRef) async {
    try {
      final res = await _dio.post('/farmer/payments/confirm', data: {
        'clusterId': clusterId,
        'upiRef': upiRef,
      });
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<List<dynamic>> getPayments() async {
    try {
      final res = await _dio.get('/farmer/payments');
      return _handleResponse(res) as List<dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Delivery ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getDelivery(String clusterId) async {
    try {
      final res = await _dio.get('/farmer/delivery/$clusterId');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> confirmDelivery(String clusterId) async {
    try {
      final res = await _dio.post('/farmer/delivery/$clusterId/confirm');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Ratings ─────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> submitRating(Map<String, dynamic> data) async {
    try {
      final res = await _dio.post('/farmer/ratings', data: data);
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Dashboard & Mandi Prices ────────────────────────────────────────────────

  Future<Map<String, dynamic>> getDashboard() async {
    try {
      final res = await _dio.get('/farmer/dashboard');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Map<String, dynamic>> getMandiPrices() async {
    try {
      final res = await _dio.get('/farmer/mandi-prices');
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  // ─── Profile ─────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    try {
      final res = await _dio.patch('/farmer/profile', data: data);
      return _handleResponse(res) as Map<String, dynamic>;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }
}

// Riverpod provider
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient.instance);
