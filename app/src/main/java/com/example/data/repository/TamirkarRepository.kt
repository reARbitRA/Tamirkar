package com.example.data.repository

import com.example.data.local.dao.TamirkarDao
import com.example.data.local.entities.BidEntity
import com.example.data.local.entities.DeviceEntity
import com.example.data.local.entities.DisputeEntity
import com.example.data.local.entities.OrderEntity
import com.example.data.local.entities.PartEntity
import com.example.data.local.entities.SopChecklistEntity
import com.example.data.local.entities.TechnicianEntity
import com.example.data.local.entities.TransactionEntity
import com.example.data.local.entities.UserEntity
import com.example.data.local.entities.WarrantyEntity
import com.example.data.remote.AiDiagnosisResult
import com.example.data.remote.AiDisputeResult
import com.example.data.remote.AiQualityCheckResult
import com.example.data.remote.AiReminderResult
import com.example.data.remote.AiSupportResponse
import com.example.data.remote.GeminiAiEngine
import kotlinx.coroutines.flow.Flow
import java.util.UUID

class TamirkarRepository(
    private val dao: TamirkarDao,
    private val aiEngine: GeminiAiEngine = GeminiAiEngine()
) {

    // --- User Management ---
    fun getCurrentUserFlow(userId: String = "user_default"): Flow<UserEntity?> =
        dao.getUserFlow(userId)

    suspend fun getCurrentUser(userId: String = "user_default"): UserEntity? =
        dao.getUser(userId)

    suspend fun saveUser(user: UserEntity) = dao.insertUser(user)

    suspend fun updateUser(user: UserEntity) = dao.updateUser(user)

    // --- Devices (Digital Passport) ---
    fun getDevicesFlow(userId: String = "user_default"): Flow<List<DeviceEntity>> =
        dao.getDevicesFlow(userId)

    fun getDeviceFlow(deviceId: String): Flow<DeviceEntity?> =
        dao.getDeviceFlow(deviceId)

    suspend fun addDevice(
        name: String,
        category: String,
        brand: String,
        model: String,
        serialNumber: String,
        purchaseDate: String,
        purchasePrice: Long,
        notes: String
    ): String {
        val deviceId = "dev_" + UUID.randomUUID().toString().take(8)
        val device = DeviceEntity(
            id = deviceId,
            userId = "user_default",
            name = name,
            category = category,
            brand = brand,
            model = model,
            serialNumber = serialNumber,
            purchaseDate = purchaseDate,
            purchasePrice = purchasePrice,
            healthScore = 95,
            lastServiceDate = "تازه ثبت شده",
            serviceCount = 0,
            notes = notes
        )
        dao.insertDevice(device)
        return deviceId
    }

    suspend fun deleteDevice(deviceId: String) = dao.deleteDevice(deviceId)

    // --- Technicians ---
    fun getAllTechniciansFlow(): Flow<List<TechnicianEntity>> = dao.getAllTechniciansFlow()

    suspend fun getTechnicianById(techId: String): TechnicianEntity? = dao.getTechnicianById(techId)

    // --- Orders ---
    fun getCustomerOrdersFlow(userId: String = "user_default"): Flow<List<OrderEntity>> =
        dao.getCustomerOrdersFlow(userId)

    fun getTechnicianOrdersFlow(techId: String = "tech_1"): Flow<List<OrderEntity>> =
        dao.getTechnicianOrdersFlow(techId)

    fun getOrderFlow(orderId: String): Flow<OrderEntity?> = dao.getOrderFlow(orderId)

    suspend fun getOrderById(orderId: String): OrderEntity? = dao.getOrderById(orderId)

    suspend fun createOrder(
        category: String,
        problemDescription: String,
        orderMode: String,
        address: String,
        deviceId: String?,
        aiDiagnosis: AiDiagnosisResult?
    ): OrderEntity {
        val orderId = "ord_" + UUID.randomUUID().toString().take(8)
        val orderNumber = "TK-" + (100000..999999).random()

        val estimatedMin = aiDiagnosis?.estimatedPriceMin ?: 600000L
        val estimatedMax = aiDiagnosis?.estimatedPriceMax ?: 1400000L

        val order = OrderEntity(
            id = orderId,
            orderNumber = orderNumber,
            customerId = "user_default",
            deviceId = deviceId,
            category = category,
            problemDescription = problemDescription,
            aiDiagnosisSummary = aiDiagnosis?.summaryFa ?: "درخواست ثبت گردید و در مرحله اعزام متخصص است.",
            aiConfidenceScore = aiDiagnosis?.confidenceScore ?: 90f,
            estimatedPriceMin = estimatedMin,
            estimatedPriceMax = estimatedMax,
            status = if (orderMode == "fast") "matching" else "waiting_bids",
            orderMode = orderMode,
            customerAddress = address,
            warrantyDays = 30
        )
        dao.insertOrder(order)

        // Generate simulated competitive bids if bidding mode
        if (orderMode == "bidding") {
            generateSimulatedBids(orderId, category)
        }

        return order
    }

    private suspend fun generateSimulatedBids(orderId: String, category: String) {
        val techs = dao.getOnlineTechnicians().take(3)
        techs.forEachIndexed { index, tech ->
            val price = 650000L + (index * 150000L)
            val bid = BidEntity(
                id = "bid_${UUID.randomUUID().toString().take(6)}",
                orderId = orderId,
                technicianId = tech.id,
                technicianName = tech.fullName,
                technicianRating = tech.rating,
                technicianLevel = tech.level,
                proposedPrice = price,
                estimatedArrivalMinutes = 20 + (index * 10),
                message = "با سلام، آماده حضور با قطعات اورجینال و ضمانت‌نامه کتبی ${tech.fullName} هستم."
            )
            dao.insertBid(bid)
        }
    }

    fun getBidsForOrderFlow(orderId: String): Flow<List<BidEntity>> =
        dao.getBidsForOrderFlow(orderId)

    suspend fun acceptBid(orderId: String, bidId: String, techId: String, agreedPrice: Long) {
        val order = dao.getOrderById(orderId) ?: return
        val updated = order.copy(
            technicianId = techId,
            finalPrice = agreedPrice,
            status = "accepted"
        )
        dao.updateOrder(updated)
    }

    suspend fun advanceOrderStatus(orderId: String, newStatus: String) {
        val order = dao.getOrderById(orderId) ?: return
        val updated = order.copy(status = newStatus)
        dao.updateOrder(updated)
    }

    suspend fun completeJobAndAudit(
        orderId: String,
        partsCost: Long,
        laborCost: Long,
        technicianNotes: String
    ): AiQualityCheckResult {
        val order = dao.getOrderById(orderId) ?: throw IllegalArgumentException("Order not found")
        val totalPrice = partsCost + laborCost
        val escrowAmount = (totalPrice * 0.15).toLong() // 15% Escrow
        val tech = order.technicianId?.let { dao.getTechnicianById(it) }
        val commissionRate = tech?.commissionRate ?: 0.14f
        val platformCommission = (laborCost * commissionRate).toLong()

        // AI QC Audit
        val qcResult = aiEngine.auditJobQuality(
            category = order.category,
            checklistCompleted = true,
            workSummary = technicianNotes
        )

        val updatedOrder = order.copy(
            finalPrice = totalPrice,
            partsCost = partsCost,
            laborCost = laborCost,
            escrowAmount = escrowAmount,
            platformCommission = platformCommission,
            status = "completed",
            technicianNotes = technicianNotes,
            qualityScore = qcResult.qualityScore,
            completedAt = System.currentTimeMillis(),
            warrantyExpiresAt = System.currentTimeMillis() + (order.warrantyDays.toLong() * 24 * 60 * 60 * 1000)
        )
        dao.updateOrder(updatedOrder)

        // Create Active Warranty
        val warranty = WarrantyEntity(
            id = "warr_" + UUID.randomUUID().toString().take(8),
            orderId = order.id,
            deviceId = order.deviceId,
            deviceName = order.deviceId?.let { dao.getDeviceById(it)?.name } ?: "دستگاه سرویس‌شده",
            customerId = order.customerId,
            technicianId = order.technicianId ?: "tech_1",
            technicianName = tech?.fullName ?: "استادکار تعمیرکار",
            warrantyDays = order.warrantyDays,
            escrowAmount = escrowAmount,
            status = "active"
        )
        dao.insertWarranty(warranty)

        // Update Device health score (+10%)
        order.deviceId?.let { devId ->
            val dev = dao.getDeviceById(devId)
            if (dev != null) {
                val newHealth = (dev.healthScore + 10).coerceAtMost(100)
                dao.updateDevice(dev.copy(healthScore = newHealth, serviceCount = dev.serviceCount + 1, lastServiceDate = "امروز"))
            }
        }

        // Ledger: Record Transaction
        val tx = TransactionEntity(
            id = "tx_" + UUID.randomUUID().toString().take(8),
            userId = order.customerId,
            orderId = order.id,
            type = "payment",
            amount = totalPrice,
            balanceBefore = 3200000L,
            balanceAfter = 3200000L - totalPrice,
            description = "تسویه حساب نهایی سفارش ${order.orderNumber} با ۱۵٪ ضمانت امانی",
            referenceId = "PAY-${(100000..999999).random()}"
        )
        dao.insertTransaction(tx)

        return qcResult
    }

    // --- Warranties & Disputes ---
    fun getCustomerWarrantiesFlow(userId: String = "user_default"): Flow<List<WarrantyEntity>> =
        dao.getCustomerWarrantiesFlow(userId)

    suspend fun fileWarrantyDispute(orderId: String, description: String): AiDisputeResult {
        val order = dao.getOrderById(orderId)
        val disputeResult = aiEngine.arbitrateDispute(
            orderSummary = "سفارش ${order?.orderNumber} رده ${order?.category}",
            customerComplaint = description,
            technicianNotes = order?.technicianNotes.orEmpty()
        )

        val dispute = DisputeEntity(
            id = "disp_" + UUID.randomUUID().toString().take(8),
            orderId = orderId,
            raisedBy = "user_default",
            againstId = order?.technicianId ?: "tech_1",
            description = description,
            aiVerdict = disputeResult.verdictSummaryFa,
            aiConfidenceScore = disputeResult.confidenceScore,
            recommendedAction = disputeResult.recommendedAction,
            refundAmount = disputeResult.refundAmountTomans,
            status = "ai_reviewed"
        )
        dao.insertDispute(dispute)

        if (order != null) {
            dao.updateOrder(order.copy(status = "disputed"))
        }

        return disputeResult
    }

    // --- Spare Parts ---
    fun getPartsFlow(category: String? = null): Flow<List<PartEntity>> = dao.getPartsFlow(category)

    suspend fun getPartById(partId: String): PartEntity? = dao.getPartById(partId)

    // --- Transactions & Wallet ---
    fun getTransactionsFlow(userId: String = "user_default"): Flow<List<TransactionEntity>> =
        dao.getTransactionsFlow(userId)

    suspend fun depositWallet(amount: Long) {
        val user = dao.getUser("user_default") ?: return
        val newBalance = user.walletBalance + amount
        dao.updateUser(user.copy(walletBalance = newBalance))

        val tx = TransactionEntity(
            id = "tx_" + UUID.randomUUID().toString().take(8),
            userId = user.id,
            type = "payment",
            amount = amount,
            balanceBefore = user.walletBalance,
            balanceAfter = newBalance,
            description = "شارژ کیف پول از طریق درگاه بانکی شاپرک/زرین‌پال",
            referenceId = "ZP-${(100000..999999).random()}"
        )
        dao.insertTransaction(tx)
    }

    // --- AI Engine Facades ---
    suspend fun diagnoseIssue(category: String, symptom: String, images: List<String> = emptyList()): AiDiagnosisResult =
        aiEngine.diagnoseIssue(category, symptom, images)

    suspend fun generatePeriodicReminder(device: DeviceEntity): AiReminderResult =
        aiEngine.generatePredictiveReminder(device.name, device.category, device.healthScore, device.lastServiceDate)

    suspend fun chatSupport(message: String, history: List<Pair<String, String>>): AiSupportResponse =
        aiEngine.chatSupport(message, history)

    suspend fun getSopChecklist(category: String): SopChecklistEntity? =
        dao.getSopChecklist(category)
}
