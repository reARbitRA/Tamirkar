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
import com.example.data.remote.AuthSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import java.util.UUID

class TamirkarRepository(
    private val dao: TamirkarDao,
    private val aiEngine: GeminiAiEngine = GeminiAiEngine()
) {

    // --- User Management ---
    private val activeUserId = MutableStateFlow<String?>(null)

    suspend fun activateAuthenticatedUser(session: AuthSession) {
        activeUserId.value = session.userId
        val current = dao.getUser(session.userId)
        if (current == null) {
            dao.insertUser(
                UserEntity(
                    id = session.userId,
                    phone = session.phone,
                    fullName = "کاربر اوستا",
                    role = session.role,
                    walletBalance = 0L,
                    escrowBalance = 0L,
                    isVerified = true,
                    referralCode = ""
                )
            )
        } else {
            dao.updateUser(current.copy(phone = session.phone, role = session.role, isVerified = true))
        }
    }

    private fun requireActiveUserId(): String = activeUserId.value
        ?: throw IllegalStateException("برای ادامه ابتدا وارد حساب خود شوید.")

    fun getCurrentUserFlow(): Flow<UserEntity?> = activeUserId.flatMapLatest { userId ->
        userId?.let(dao::getUserFlow) ?: flowOf(null)
    }

    suspend fun getCurrentUser(): UserEntity? = activeUserId.value?.let(dao::getUser)

    suspend fun saveUser(user: UserEntity) = dao.insertUser(user)

    suspend fun updateUser(user: UserEntity) = dao.updateUser(user)

    // --- Devices (Digital Passport) ---
    fun getDevicesFlow(): Flow<List<DeviceEntity>> = activeUserId.flatMapLatest { userId ->
        userId?.let(dao::getDevicesFlow) ?: flowOf(emptyList())
    }

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
            userId = requireActiveUserId(),
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
    fun getCustomerOrdersFlow(): Flow<List<OrderEntity>> = activeUserId.flatMapLatest { userId ->
        userId?.let(dao::getCustomerOrdersFlow) ?: flowOf(emptyList())
    }

    fun getTechnicianOrdersFlow(techId: String = "tech_1"): Flow<List<OrderEntity>> =
        dao.getTechnicianOrdersFlow(techId)

    fun getOrderFlow(orderId: String): Flow<OrderEntity?> = dao.getOrderFlow(orderId)

    suspend fun getOrderById(orderId: String): OrderEntity? = dao.getOrderById(orderId)

    /**
     * Booking, matching, quote acceptance, payment and settlement are server-authoritative.
     * The local demo implementation was deliberately removed rather than presenting simulated
     * technicians or money movements as real marketplace activity.
     */
    suspend fun createOrder(
        category: String,
        problemDescription: String,
        orderMode: String,
        address: String,
        deviceId: String?,
        aiDiagnosis: AiDiagnosisResult?
    ): OrderEntity = throw IllegalStateException("ثبت سفارش تا فعال‌سازی سرور رزرو در دسترس نیست.")

    fun getBidsForOrderFlow(orderId: String): Flow<List<BidEntity>> = dao.getBidsForOrderFlow(orderId)

    suspend fun acceptBid(orderId: String, bidId: String, techId: String, agreedPrice: Long) {
        throw IllegalStateException("پذیرش پیشنهاد فقط از طریق سرور اوستا انجام می‌شود.")
    }

    suspend fun advanceOrderStatus(orderId: String, newStatus: String) {
        throw IllegalStateException("تغییر وضعیت سفارش فقط از طریق سرور اوستا انجام می‌شود.")
    }

    suspend fun completeJobAndAudit(
        orderId: String,
        partsCost: Long,
        laborCost: Long,
        technicianNotes: String
    ): AiQualityCheckResult = throw IllegalStateException("تسویه و ضمانت فقط از طریق سرور اوستا انجام می‌شود.")

    // --- Warranties & Disputes ---
    fun getCustomerWarrantiesFlow(): Flow<List<WarrantyEntity>> = activeUserId.flatMapLatest { userId ->
        userId?.let(dao::getCustomerWarrantiesFlow) ?: flowOf(emptyList())
    }

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
            raisedBy = requireActiveUserId(),
            againstId = order?.technicianId ?: "",
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
    fun getTransactionsFlow(): Flow<List<TransactionEntity>> = activeUserId.flatMapLatest { userId ->
        userId?.let(dao::getTransactionsFlow) ?: flowOf(emptyList())
    }

    suspend fun depositWallet(amount: Long) {
        throw IllegalStateException("پرداخت فقط پس از فعال‌سازی درگاه سروری امکان‌پذیر است.")
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
