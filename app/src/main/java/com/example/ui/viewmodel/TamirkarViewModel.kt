package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.local.TamirkarDatabase
import com.example.data.local.entities.BidEntity
import com.example.data.local.entities.DeviceEntity
import com.example.data.local.entities.OrderEntity
import com.example.data.local.entities.PartEntity
import com.example.data.local.entities.TechnicianEntity
import com.example.data.local.entities.TransactionEntity
import com.example.data.local.entities.UserEntity
import com.example.data.local.entities.WarrantyEntity
import com.example.data.remote.AiDiagnosisResult
import com.example.data.remote.AiDisputeResult
import com.example.data.remote.AiQualityCheckResult
import com.example.data.remote.AiReminderResult
import com.example.data.remote.AiSupportResponse
import com.example.data.repository.TamirkarRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed class UiState<out T> {
    data object Idle : UiState<Nothing>()
    data object Loading : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
    data class Error(val message: String) : UiState<Nothing>()
}

data class ChatMessage(
    val sender: String, // "user" or "ai"
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
    val actions: List<String> = emptyList()
)

class TamirkarViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: TamirkarRepository

    init {
        val db = TamirkarDatabase.getDatabase(application)
        repository = TamirkarRepository(db.tamirkarDao())
    }

    // App Mode: "customer" vs "technician"
    private val _appMode = MutableStateFlow("customer")
    val appMode: StateFlow<String> = _appMode.asStateFlow()

    fun setAppMode(mode: String) {
        _appMode.value = mode
    }

    // Current User
    val currentUser: StateFlow<UserEntity?> = repository.getCurrentUserFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    // Digital Passport Devices
    val devices: StateFlow<List<DeviceEntity>> = repository.getDevicesFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Orders
    val customerOrders: StateFlow<List<OrderEntity>> = repository.getCustomerOrdersFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val technicianOrders: StateFlow<List<OrderEntity>> = repository.getTechnicianOrdersFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Warranties
    val warranties: StateFlow<List<WarrantyEntity>> = repository.getCustomerWarrantiesFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Spare Parts
    val parts: StateFlow<List<PartEntity>> = repository.getPartsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Transactions
    val transactions: StateFlow<List<TransactionEntity>> = repository.getTransactionsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Technicians
    val technicians: StateFlow<List<TechnicianEntity>> = repository.getAllTechniciansFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // --- AI Diagnosis State ---
    private val _diagnosisState = MutableStateFlow<UiState<AiDiagnosisResult>>(UiState.Idle)
    val diagnosisState: StateFlow<UiState<AiDiagnosisResult>> = _diagnosisState.asStateFlow()

    fun runDiagnosis(category: String, symptom: String, images: List<String> = emptyList()) {
        viewModelScope.launch {
            _diagnosisState.value = UiState.Loading
            try {
                val result = repository.diagnoseIssue(category, symptom, images)
                _diagnosisState.value = UiState.Success(result)
            } catch (e: Exception) {
                _diagnosisState.value = UiState.Error(e.message ?: "خطا در برقراری ارتباط با هوش مصنوعی")
            }
        }
    }

    fun resetDiagnosis() {
        _diagnosisState.value = UiState.Idle
    }

    // --- Order Creation & Radar ---
    private val _createdOrder = MutableStateFlow<OrderEntity?>(null)
    val createdOrder: StateFlow<OrderEntity?> = _createdOrder.asStateFlow()

    fun createNewOrder(
        category: String,
        description: String,
        mode: String,
        address: String,
        deviceId: String?,
        diagnosis: AiDiagnosisResult?,
        onOrderCreated: (String) -> Unit
    ) {
        viewModelScope.launch {
            val order = repository.createOrder(category, description, mode, address, deviceId, diagnosis)
            _createdOrder.value = order
            onOrderCreated(order.id)
        }
    }

    fun getBidsForOrder(orderId: String) = repository.getBidsForOrderFlow(orderId)

    fun acceptBid(orderId: String, bidId: String, techId: String, price: Long, onAccepted: () -> Unit) {
        viewModelScope.launch {
            repository.acceptBid(orderId, bidId, techId, price)
            onAccepted()
        }
    }

    // Simulate Order Progress Animation for Tracking
    fun simulateAdvanceOrder(orderId: String) {
        viewModelScope.launch {
            repository.advanceOrderStatus(orderId, "on_way")
            delay(4000)
            repository.advanceOrderStatus(orderId, "arrived")
            delay(4000)
            repository.advanceOrderStatus(orderId, "repairing")
        }
    }

    // --- Device Management ---
    fun addDevice(
        name: String,
        category: String,
        brand: String,
        model: String,
        serialNumber: String,
        purchaseDate: String,
        price: Long,
        notes: String,
        onSuccess: () -> Unit
    ) {
        viewModelScope.launch {
            repository.addDevice(name, category, brand, model, serialNumber, purchaseDate, price, notes)
            onSuccess()
        }
    }

    fun deleteDevice(deviceId: String) {
        viewModelScope.launch {
            repository.deleteDevice(deviceId)
        }
    }

    // --- Wallet ---
    fun depositWallet(amount: Long, onSuccess: () -> Unit) {
        viewModelScope.launch {
            repository.depositWallet(amount)
            onSuccess()
        }
    }

    // --- Technician SOP & Completion ---
    private val _qcResult = MutableStateFlow<UiState<AiQualityCheckResult>>(UiState.Idle)
    val qcResult: StateFlow<UiState<AiQualityCheckResult>> = _qcResult.asStateFlow()

    fun completeTechnicianJob(
        orderId: String,
        partsCost: Long,
        laborCost: Long,
        notes: String,
        onCompleted: () -> Unit
    ) {
        viewModelScope.launch {
            _qcResult.value = UiState.Loading
            try {
                val result = repository.completeJobAndAudit(orderId, partsCost, laborCost, notes)
                _qcResult.value = UiState.Success(result)
                onCompleted()
            } catch (e: Exception) {
                _qcResult.value = UiState.Error(e.message ?: "خطا در تأیید نهایی")
            }
        }
    }

    // --- Warranty Dispute ---
    private val _disputeResult = MutableStateFlow<UiState<AiDisputeResult>>(UiState.Idle)
    val disputeResult: StateFlow<UiState<AiDisputeResult>> = _disputeResult.asStateFlow()

    fun fileDispute(orderId: String, description: String) {
        viewModelScope.launch {
            _disputeResult.value = UiState.Loading
            try {
                val result = repository.fileWarrantyDispute(orderId, description)
                _disputeResult.value = UiState.Success(result)
            } catch (e: Exception) {
                _disputeResult.value = UiState.Error(e.message ?: "خطا در ثبت داوری")
            }
        }
    }

    // --- Support Chat ---
    private val _chatMessages = MutableStateFlow<List<ChatMessage>>(
        listOf(
            ChatMessage(
                sender = "ai",
                text = "سلام! من دستیار هوشمند تعمیرکار هستم. چطور می‌توانم در عیب‌یابی لوازم، استعلام قیمت، پاسپورت دیجیتال یا پیگیری ضمانت‌نامه به شما کمک کنم؟",
                actions = listOf("عیب‌یابی هوشمند با تصویر", "استعلام شرایط ضمانت ۱۵٪", "پاسپورت دیجیتال وسایل من")
            )
        )
    )
    val chatMessages: StateFlow<List<ChatMessage>> = _chatMessages.asStateFlow()

    private val _isChatTyping = MutableStateFlow(false)
    val isChatTyping: StateFlow<Boolean> = _isChatTyping.asStateFlow()

    fun sendChatMessage(text: String) {
        val current = _chatMessages.value.toMutableList()
        current.add(ChatMessage(sender = "user", text = text))
        _chatMessages.value = current

        viewModelScope.launch {
            _isChatTyping.value = true
            val history = current.map { it.sender to it.text }
            val response = repository.chatSupport(text, history)
            _isChatTyping.value = false

            val updated = _chatMessages.value.toMutableList()
            updated.add(
                ChatMessage(
                    sender = "ai",
                    text = response.replyFa,
                    actions = response.suggestedActions
                )
            )
            _chatMessages.value = updated
        }
    }
}
