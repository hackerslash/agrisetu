class Farmer {
  final String id;
  final String phone;
  final String? name;
  final String? village;
  final String? district;
  final String? state;
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
    this.village,
    this.district,
    this.state,
    this.landArea,
    this.cropsGrown = const [],
    this.upiId,
    this.language = 'en',
    this.aadhaarLinked = false,
    required this.createdAt,
  });

  bool get isProfileComplete =>
      name != null && village != null && district != null;

  int get profileCompleteness {
    int score = 0;
    if (name != null) score += 20;
    if (village != null) score += 15;
    if (district != null) score += 15;
    if (state != null) score += 10;
    if (landArea != null) score += 10;
    if (cropsGrown.isNotEmpty) score += 15;
    if (upiId != null) score += 15;
    return score;
  }

  factory Farmer.fromJson(Map<String, dynamic> json) {
    return Farmer(
      id: json['id'] as String,
      phone: json['phone'] as String,
      name: json['name'] as String?,
      village: json['village'] as String?,
      district: json['district'] as String?,
      state: json['state'] as String?,
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
        'village': village,
        'district': district,
        'state': state,
        'landArea': landArea,
        'cropsGrown': cropsGrown,
        'upiId': upiId,
        'language': language,
        'aadhaarLinked': aadhaarLinked,
        'createdAt': createdAt.toIso8601String(),
      };

  Farmer copyWith({
    String? name,
    String? village,
    String? district,
    String? state,
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
      village: village ?? this.village,
      district: district ?? this.district,
      state: state ?? this.state,
      landArea: landArea ?? this.landArea,
      cropsGrown: cropsGrown ?? this.cropsGrown,
      upiId: upiId ?? this.upiId,
      language: language ?? this.language,
      aadhaarLinked: aadhaarLinked ?? this.aadhaarLinked,
      createdAt: createdAt,
    );
  }
}
