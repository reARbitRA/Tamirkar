package com.example.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * 1. Users Entity
 */
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val phone: String,
    val fullName: String,
    val role: String = "customer", // customer | technician | admin
    val walletBalance: Long = 0L,   // Spendable in Tomans
    val escrowBalance: Long = 0L,   // Escrow locked
    val city: String = "تهران",
    val profileImageUrl: String = "",
    val isVerified: Boolean = true,
    val referralCode: String = "TK8842",
    val totalOrders: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * 2. Technicians Entity
 */
@Entity(tableName = "technicians")
data class TechnicianEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val fullName: String,
    val specialties: String, // Comma-separated categories: mobile,ac,washer,etc.
    val experienceYears: Int = 5,
    val rating: Float = 4.85f,
    val totalJobs: Int = 120,
    val completedJobs: Int = 118,
    val warrantyComplianceRate: Float = 98.5f,
    val avgResponseMinutes: Int = 25,
    val level: String = "master", // apprentice | specialist | master | superstar
    val xpPoints: Int = 6200,
    val bankSheba: String = "IR820170000000123456789012",
    val commissionRate: Float = 0.14f,
    val totalEarnings: Long = 45000000L,
    val netEarnings: Long = 38700000L,
    val isOnline: Boolean = true,
    val currentLat: Double = 35.7219,
    val currentLng: Double = 51.3347,
    val avatarUrl: String = "",
    val bio: String = "استادکار رسمی سازمان فنی و حرفه‌ای با ۱۰ سال سابقه تخصصی در تهران"
)

/**
 * 3. Devices Entity (Digital Passport)
 */
@Entity(tableName = "devices")
data class DeviceEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val name: String, // e.g. "یخچال فریزر ساید بای ساید"
    val category: String, // ac | washer | refrigerator | mobile | laptop | car
    val brand: String, // ال‌جی, سامسونگ, اسنوا
    val model: String,
    val serialNumber: String = "",
    val purchaseDate: String = "۱۴۰۱/۰۴/۱۵",
    val purchasePrice: Long = 35000000L,
    val healthScore: Int = 88, // 0 to 100%
    val lastServiceDate: String = "۱۴۰۳/۰۲/۱۰",
    val serviceCount: Int = 2,
    val deviceImageUrl: String = "",
    val notes: String = "سرویس دوره‌ای هر ۶ ماه، تعویض فیلتر در آخرین مراجعه انجام شد.",
    val isActive: Boolean = true
)

/**
 * 4. Orders Entity
 */
@Entity(tableName = "orders")
data class OrderEntity(
    @PrimaryKey val id: String,
    val orderNumber: String, // e.g. "TK-140305-9214"
    val customerId: String,
    val technicianId: String? = null,
    val deviceId: String? = null,
    val category: String,
    val problemDescription: String,
    val problemImages: String = "", // comma-separated or json
    val aiDiagnosisSummary: String = "",
    val aiConfidenceScore: Float = 92f,
    val estimatedPriceMin: Long = 600000L,
    val estimatedPriceMax: Long = 1400000L,
    val finalPrice: Long = 0L,
    val partsCost: Long = 0L,
    val laborCost: Long = 0L,
    val escrowAmount: Long = 0L, // 15%
    val platformCommission: Long = 0L,
    val status: String = "pending", // pending | matching | waiting_bids | accepted | on_way | arrived | diagnosing | repairing | completed | cancelled | disputed
    val orderMode: String = "fast", // fast | bidding
    val customerAddress: String = "تهران، سعادت‌آباد، خیابان سرو غربی، پلاک ۲۴",
    val customerLat: Double = 35.7760,
    val customerLng: Double = 51.3750,
    val scheduledAt: String = "امروز - ساعت ۱۶:۰۰",
    val warrantyDays: Int = 30,
    val warrantyExpiresAt: Long = 0L,
    val beforeImages: String = "",
    val afterImages: String = "",
    val checklistData: String = "",
    val technicianNotes: String = "",
    val qualityScore: Int = 90,
    val createdAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = null
)

/**
 * 5. Bids Entity
 */
@Entity(tableName = "bids")
data class BidEntity(
    @PrimaryKey val id: String,
    val orderId: String,
    val technicianId: String,
    val technicianName: String,
    val technicianRating: Float,
    val technicianLevel: String,
    val proposedPrice: Long, // in Tomans
    val estimatedArrivalMinutes: Int,
    val message: String,
    val status: String = "pending", // pending | accepted | rejected | expired
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * 6. Warranties Entity
 */
@Entity(tableName = "warranties")
data class WarrantyEntity(
    @PrimaryKey val id: String,
    val orderId: String,
    val deviceId: String?,
    val deviceName: String,
    val customerId: String,
    val technicianId: String,
    val technicianName: String,
    val warrantyDays: Int = 30,
    val startsAt: Long = System.currentTimeMillis(),
    val expiresAt: Long = System.currentTimeMillis() + (30L * 24 * 60 * 60 * 1000),
    val status: String = "active", // active | claimed | expired | void
    val escrowAmount: Long = 180000L,
    val claimDescription: String? = null,
    val resolutionStatus: String? = null
)

/**
 * 7. Parts Entity
 */
@Entity(tableName = "parts")
data class PartEntity(
    @PrimaryKey val id: String,
    val name: String,
    val nameEn: String = "",
    val category: String,
    val brand: String,
    val compatibleModels: String,
    val partNumber: String = "",
    val qualityLevel: String = "original", // original | grade_a | economy
    val price: Long, // in Tomans
    val stockQuantity: Int = 15,
    val imageUrl: String = "",
    val description: String = "",
    val isVerified: Boolean = true,
    val soldCount: Int = 42,
    val rating: Float = 4.9f,
    val warrantyDays: Int = 90
)

/**
 * 8. Transactions Entity
 */
@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val orderId: String? = null,
    val type: String, // payment | commission | escrow_hold | escrow_release | refund | withdrawal | bonus
    val amount: Long, // Tomans
    val balanceBefore: Long,
    val balanceAfter: Long,
    val description: String,
    val referenceId: String,
    val status: String = "completed",
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * 9. Disputes Entity
 */
@Entity(tableName = "disputes")
data class DisputeEntity(
    @PrimaryKey val id: String,
    val orderId: String,
    val raisedBy: String,
    val againstId: String,
    val description: String,
    val aiAnalysisJson: String = "",
    val aiConfidenceScore: Float = 88f,
    val aiVerdict: String = "",
    val recommendedAction: String = "full_refund",
    val status: String = "open", // open | ai_reviewed | resolved | closed
    val refundAmount: Long = 0L,
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * 10. SOP Checklists Entity
 */
@Entity(tableName = "sop_checklists")
data class SopChecklistEntity(
    @PrimaryKey val id: String,
    val category: String,
    val title: String,
    val stepsJson: String // JSON array of steps
)
