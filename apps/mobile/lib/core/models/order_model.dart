enum OrderStatus {
  pending,
  clustered,
  paymentPending,
  paid,
  processing,
  outForDelivery,
  dispatched,
  delivered,
  rejected,
  failed;

  static OrderStatus fromString(String value) {
    switch (value.toUpperCase()) {
      case 'PENDING':
        return OrderStatus.pending;
      case 'CLUSTERED':
        return OrderStatus.clustered;
      case 'PAYMENT_PENDING':
        return OrderStatus.paymentPending;
      case 'PAID':
        return OrderStatus.paid;
      case 'PROCESSING':
        return OrderStatus.processing;
      case 'OUT_FOR_DELIVERY':
        return OrderStatus.outForDelivery;
      case 'DISPATCHED':
        return OrderStatus.dispatched;
      case 'DELIVERED':
        return OrderStatus.delivered;
      case 'REJECTED':
        return OrderStatus.rejected;
      case 'FAILED':
        return OrderStatus.failed;
      default:
        return OrderStatus.pending;
    }
  }

  String get displayLabel {
    switch (this) {
      case OrderStatus.pending:
        return 'Pending';
      case OrderStatus.clustered:
        return 'In Cluster';
      case OrderStatus.paymentPending:
        return 'Payment Due';
      case OrderStatus.paid:
        return 'Paid';
      case OrderStatus.processing:
        return 'Processing';
      case OrderStatus.outForDelivery:
        return 'Out for Delivery';
      case OrderStatus.dispatched:
        return 'In Transit';
      case OrderStatus.delivered:
        return 'Delivered';
      case OrderStatus.rejected:
        return 'Rejected';
      case OrderStatus.failed:
        return 'Failed';
    }
  }
}

class Order {
  final String id;
  final String farmerId;
  final String cropName;
  final double quantity;
  final String unit;
  final DateTime? deliveryDate;
  final OrderStatus status;
  final DateTime createdAt;
  final ClusterMember? clusterMember;

  const Order({
    required this.id,
    required this.farmerId,
    required this.cropName,
    required this.quantity,
    required this.unit,
    this.deliveryDate,
    required this.status,
    required this.createdAt,
    this.clusterMember,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] as String,
      farmerId: json['farmerId'] as String,
      cropName: json['cropName'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unit: json['unit'] as String,
      deliveryDate: json['deliveryDate'] != null
          ? DateTime.parse(json['deliveryDate'] as String)
          : null,
      status: OrderStatus.fromString(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      clusterMember: json['clusterMember'] != null
          ? ClusterMember.fromJson(
              json['clusterMember'] as Map<String, dynamic>)
          : null,
    );
  }
}

class ClusterMember {
  final String id;
  final String clusterId;
  final String farmerId;
  final String orderId;
  final double quantity;
  final bool hasPaid;
  final DateTime? paidAt;
  final Cluster? cluster;

  const ClusterMember({
    required this.id,
    required this.clusterId,
    required this.farmerId,
    required this.orderId,
    required this.quantity,
    required this.hasPaid,
    this.paidAt,
    this.cluster,
  });

  factory ClusterMember.fromJson(Map<String, dynamic> json) {
    return ClusterMember(
      id: json['id'] as String,
      clusterId: json['clusterId'] as String,
      farmerId: json['farmerId'] as String,
      orderId: json['orderId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      hasPaid: json['hasPaid'] as bool? ?? false,
      paidAt: json['paidAt'] != null
          ? DateTime.parse(json['paidAt'] as String)
          : null,
      cluster: json['cluster'] != null
          ? Cluster.fromJson(json['cluster'] as Map<String, dynamic>)
          : null,
    );
  }
}

enum ClusterStatus {
  forming,
  voting,
  payment,
  processing,
  outForDelivery,
  dispatched,
  completed,
  failed;

  static ClusterStatus fromString(String value) {
    switch (value.toUpperCase()) {
      case 'FORMING':
        return ClusterStatus.forming;
      case 'VOTING':
        return ClusterStatus.voting;
      case 'PAYMENT':
        return ClusterStatus.payment;
      case 'PROCESSING':
        return ClusterStatus.processing;
      case 'OUT_FOR_DELIVERY':
        return ClusterStatus.outForDelivery;
      case 'DISPATCHED':
        return ClusterStatus.dispatched;
      case 'COMPLETED':
        return ClusterStatus.completed;
      case 'FAILED':
        return ClusterStatus.failed;
      default:
        return ClusterStatus.forming;
    }
  }

  String get displayLabel {
    switch (this) {
      case ClusterStatus.forming:
        return 'Forming';
      case ClusterStatus.voting:
        return 'Voting';
      case ClusterStatus.payment:
        return 'Payment';
      case ClusterStatus.processing:
        return 'Processing';
      case ClusterStatus.outForDelivery:
        return 'Out for Delivery';
      case ClusterStatus.dispatched:
        return 'In Transit';
      case ClusterStatus.completed:
        return 'Completed';
      case ClusterStatus.failed:
        return 'Failed';
    }
  }
}

class Cluster {
  final String id;
  final String cropName;
  final String unit;
  final double targetQuantity;
  final double currentQuantity;
  final ClusterStatus status;
  final String? district;
  final String? state;
  final String? vendorId;
  final String? gigId;
  final DateTime createdAt;
  final List<ClusterMember> members;
  final List<VendorBid> bids;
  final Delivery? delivery;
  final Vendor? vendor;
  final List<Rating> ratings;

  const Cluster({
    required this.id,
    required this.cropName,
    required this.unit,
    required this.targetQuantity,
    required this.currentQuantity,
    required this.status,
    this.district,
    this.state,
    this.vendorId,
    this.gigId,
    required this.createdAt,
    this.members = const [],
    this.bids = const [],
    this.delivery,
    this.vendor,
    this.ratings = const [],
  });

  double get fillPercent => targetQuantity > 0
      ? (currentQuantity / targetQuantity).clamp(0.0, 1.0)
      : 0;
  int get membersCount => members.length;

  factory Cluster.fromJson(Map<String, dynamic> json) {
    return Cluster(
      id: json['id'] as String,
      cropName: json['cropName'] as String,
      unit: json['unit'] as String,
      targetQuantity: (json['targetQuantity'] as num).toDouble(),
      currentQuantity: (json['currentQuantity'] as num).toDouble(),
      status: ClusterStatus.fromString(json['status'] as String),
      district: json['district'] as String?,
      state: json['state'] as String?,
      vendorId: json['vendorId'] as String?,
      gigId: json['gigId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      members: (json['members'] as List<dynamic>?)
              ?.map((e) => ClusterMember.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      bids: (json['bids'] as List<dynamic>?)
              ?.map((e) => VendorBid.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      delivery: json['delivery'] != null
          ? Delivery.fromJson(json['delivery'] as Map<String, dynamic>)
          : null,
      vendor: json['vendor'] != null
          ? Vendor.fromJson(json['vendor'] as Map<String, dynamic>)
          : null,
      ratings: (json['ratings'] as List<dynamic>?)
              ?.map((e) => Rating.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class VendorBid {
  final String id;
  final String clusterId;
  final String vendorId;
  final String? gigId;
  final double pricePerUnit;
  final double totalPrice;
  final String? note;
  final int votes;
  final DateTime createdAt;
  final Vendor? vendor;
  // Non-empty = current farmer already voted on this bid
  final List<dynamic> vendorVotes;

  const VendorBid({
    required this.id,
    required this.clusterId,
    required this.vendorId,
    this.gigId,
    required this.pricePerUnit,
    required this.totalPrice,
    this.note,
    required this.votes,
    required this.createdAt,
    this.vendor,
    this.vendorVotes = const [],
  });

  bool get currentFarmerVoted => vendorVotes.isNotEmpty;

  factory VendorBid.fromJson(Map<String, dynamic> json) {
    return VendorBid(
      id: json['id'] as String,
      clusterId: json['clusterId'] as String,
      vendorId: json['vendorId'] as String,
      gigId: json['gigId'] as String?,
      pricePerUnit: (json['pricePerUnit'] as num).toDouble(),
      totalPrice: (json['totalPrice'] as num).toDouble(),
      note: json['note'] as String?,
      votes: json['votes'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      vendor: json['vendor'] != null
          ? Vendor.fromJson(json['vendor'] as Map<String, dynamic>)
          : null,
      vendorVotes: json['vendorVotes'] as List<dynamic>? ?? [],
    );
  }
}

class Vendor {
  final String id;
  final String businessName;
  final String contactName;
  final String? state;
  final String? businessType;
  final bool isVerified;

  const Vendor({
    required this.id,
    required this.businessName,
    required this.contactName,
    this.state,
    this.businessType,
    required this.isVerified,
  });

  factory Vendor.fromJson(Map<String, dynamic> json) {
    return Vendor(
      id: json['id'] as String,
      businessName: json['businessName'] as String,
      contactName: json['contactName'] as String,
      state: json['state'] as String?,
      businessType: json['businessType'] as String?,
      isVerified: json['isVerified'] as bool? ?? false,
    );
  }
}

enum PaymentStatus {
  pending,
  success,
  failed,
  refunded;

  static PaymentStatus fromString(String value) {
    switch (value.toUpperCase()) {
      case 'PENDING':
        return PaymentStatus.pending;
      case 'SUCCESS':
        return PaymentStatus.success;
      case 'FAILED':
        return PaymentStatus.failed;
      case 'REFUNDED':
        return PaymentStatus.refunded;
      default:
        return PaymentStatus.pending;
    }
  }
}

class Payment {
  final String id;
  final String clusterId;
  final String farmerId;
  final double amount;
  final String? upiRef;
  final PaymentStatus status;
  final DateTime createdAt;

  const Payment({
    required this.id,
    required this.clusterId,
    required this.farmerId,
    required this.amount,
    this.upiRef,
    required this.status,
    required this.createdAt,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      id: json['id'] as String,
      clusterId: json['clusterId'] as String,
      farmerId: json['farmerId'] as String,
      amount: (json['amount'] as num).toDouble(),
      upiRef: json['upiRef'] as String?,
      status: PaymentStatus.fromString(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class TrackingStep {
  final String step;
  final String status;
  final DateTime? timestamp;

  const TrackingStep({
    required this.step,
    required this.status,
    this.timestamp,
  });

  bool get isCompleted => status == 'completed';
  bool get isInProgress => status == 'in_progress';

  factory TrackingStep.fromJson(Map<String, dynamic> json) {
    return TrackingStep(
      step: json['step'] as String,
      status: json['status'] as String,
      timestamp: json['timestamp'] != null
          ? DateTime.tryParse(json['timestamp'] as String)
          : null,
    );
  }
}

class Delivery {
  final String id;
  final String clusterId;
  final List<TrackingStep> trackingSteps;
  final DateTime? confirmedAt;
  final DateTime createdAt;

  const Delivery({
    required this.id,
    required this.clusterId,
    required this.trackingSteps,
    this.confirmedAt,
    required this.createdAt,
  });

  factory Delivery.fromJson(Map<String, dynamic> json) {
    return Delivery(
      id: json['id'] as String,
      clusterId: json['clusterId'] as String,
      trackingSteps: (json['trackingSteps'] as List<dynamic>)
          .map((e) => TrackingStep.fromJson(e as Map<String, dynamic>))
          .toList(),
      confirmedAt: json['confirmedAt'] != null
          ? DateTime.parse(json['confirmedAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class Rating {
  final String id;
  final String farmerId;
  final String vendorId;
  final String clusterId;
  final int score;
  final List<String> tags;
  final String? comment;
  final DateTime createdAt;

  const Rating({
    required this.id,
    required this.farmerId,
    required this.vendorId,
    required this.clusterId,
    required this.score,
    required this.tags,
    this.comment,
    required this.createdAt,
  });

  factory Rating.fromJson(Map<String, dynamic> json) {
    return Rating(
      id: json['id'] as String,
      farmerId: json['farmerId'] as String,
      vendorId: json['vendorId'] as String,
      clusterId: json['clusterId'] as String,
      score: json['score'] as int,
      tags: List<String>.from(json['tags'] ?? []),
      comment: json['comment'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
