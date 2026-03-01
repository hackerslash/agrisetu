class Farmer {
  final String id;
  final String phone;
  final String? name;
  final String? avatarUrl;
  final String? village;
  final String? district;
  final String? state;
  final String? locationAddress;
  final double? latitude;
  final double? longitude;
  final double? landArea;
  final List<String> cropsGrown;
  final String? upiId;
  final String language;
  final bool aadhaarLinked;
  final DateTime createdAt;

  const Farmer({
    required this.id,
    required this.phone,
    this.name,
    this.avatarUrl,
    this.village,
    this.district,
    this.state,
    this.locationAddress,
    this.latitude,
    this.longitude,
    this.landArea,
    this.cropsGrown = const [],
    this.upiId,
    this.language = 'en',
    this.aadhaarLinked = false,
    required this.createdAt,
  });

  bool get isProfileComplete =>
      name != null &&
      district != null &&
      ((latitude != null && longitude != null) || village != null);

  int get profileCompleteness {
    int score = 0;
    if (name != null) score += 20;
    if (village != null) score += 15;
    if (district != null) score += 15;
    if (state != null) score += 10;
    if (locationAddress != null) score += 10;
    if (latitude != null && longitude != null) score += 10;
    if (landArea != null) score += 10;
    if (cropsGrown.isNotEmpty) score += 15;
    if (upiId != null) score += 15;
    return score.clamp(0, 100);
  }

  factory Farmer.fromJson(Map<String, dynamic> json) {
    return Farmer(
      id: json['id'] as String,
      phone: json['phone'] as String,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      village: json['village'] as String?,
      district: json['district'] as String?,
      state: json['state'] as String?,
      locationAddress: json['locationAddress'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      landArea: (json['landArea'] as num?)?.toDouble(),
      cropsGrown: List<String>.from(json['cropsGrown'] ?? []),
      upiId: json['upiId'] as String?,
      language: json['language'] as String? ?? 'en',
      aadhaarLinked: json['aadhaarLinked'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone': phone,
        'name': name,
        'avatarUrl': avatarUrl,
        'village': village,
        'district': district,
        'state': state,
        'locationAddress': locationAddress,
        'latitude': latitude,
        'longitude': longitude,
        'landArea': landArea,
        'cropsGrown': cropsGrown,
        'upiId': upiId,
        'language': language,
        'aadhaarLinked': aadhaarLinked,
        'createdAt': createdAt.toIso8601String(),
      };

  Farmer copyWith({
    String? name,
    String? avatarUrl,
    String? village,
    String? district,
    String? state,
    String? locationAddress,
    double? latitude,
    double? longitude,
    double? landArea,
    List<String>? cropsGrown,
    String? upiId,
    String? language,
    bool? aadhaarLinked,
  }) {
    return Farmer(
      id: id,
      phone: phone,
      name: name ?? this.name,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      village: village ?? this.village,
      district: district ?? this.district,
      state: state ?? this.state,
      locationAddress: locationAddress ?? this.locationAddress,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      landArea: landArea ?? this.landArea,
      cropsGrown: cropsGrown ?? this.cropsGrown,
      upiId: upiId ?? this.upiId,
      language: language ?? this.language,
      aadhaarLinked: aadhaarLinked ?? this.aadhaarLinked,
      createdAt: createdAt,
    );
  }
}
