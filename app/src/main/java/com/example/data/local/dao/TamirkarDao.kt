package com.example.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
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
import kotlinx.coroutines.flow.Flow

@Dao
interface TamirkarDao {

    // --- Users ---
    @Query("SELECT * FROM users WHERE id = :userId LIMIT 1")
    fun getUserFlow(userId: String): Flow<UserEntity?>

    @Query("SELECT * FROM users WHERE id = :userId LIMIT 1")
    suspend fun getUser(userId: String): UserEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity)

    @Update
    suspend fun updateUser(user: UserEntity)

    // --- Devices (Digital Passport) ---
    @Query("SELECT * FROM devices WHERE userId = :userId AND isActive = 1 ORDER BY healthScore ASC")
    fun getDevicesFlow(userId: String): Flow<List<DeviceEntity>>

    @Query("SELECT * FROM devices WHERE id = :deviceId LIMIT 1")
    fun getDeviceFlow(deviceId: String): Flow<DeviceEntity?>

    @Query("SELECT * FROM devices WHERE id = :deviceId LIMIT 1")
    suspend fun getDeviceById(deviceId: String): DeviceEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDevice(device: DeviceEntity)

    @Update
    suspend fun updateDevice(device: DeviceEntity)

    @Query("DELETE FROM devices WHERE id = :deviceId")
    suspend fun deleteDevice(deviceId: String)

    // --- Technicians ---
    @Query("SELECT * FROM technicians ORDER BY rating DESC, completedJobs DESC")
    fun getAllTechniciansFlow(): Flow<List<TechnicianEntity>>

    @Query("SELECT * FROM technicians WHERE isOnline = 1")
    suspend fun getOnlineTechnicians(): List<TechnicianEntity>

    @Query("SELECT * FROM technicians WHERE id = :techId LIMIT 1")
    suspend fun getTechnicianById(techId: String): TechnicianEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTechnicians(technicians: List<TechnicianEntity>)

    @Update
    suspend fun updateTechnician(technician: TechnicianEntity)

    // --- Orders ---
    @Query("SELECT * FROM orders WHERE customerId = :userId ORDER BY createdAt DESC")
    fun getCustomerOrdersFlow(userId: String): Flow<List<OrderEntity>>

    @Query("SELECT * FROM orders WHERE technicianId = :techId OR status IN ('matching', 'waiting_bids') ORDER BY createdAt DESC")
    fun getTechnicianOrdersFlow(techId: String): Flow<List<OrderEntity>>

    @Query("SELECT * FROM orders WHERE id = :orderId LIMIT 1")
    fun getOrderFlow(orderId: String): Flow<OrderEntity?>

    @Query("SELECT * FROM orders WHERE id = :orderId LIMIT 1")
    suspend fun getOrderById(orderId: String): OrderEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: OrderEntity)

    @Update
    suspend fun updateOrder(order: OrderEntity)

    // --- Bids ---
    @Query("SELECT * FROM bids WHERE orderId = :orderId ORDER BY proposedPrice ASC")
    fun getBidsForOrderFlow(orderId: String): Flow<List<BidEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBid(bid: BidEntity)

    @Update
    suspend fun updateBid(bid: BidEntity)

    // --- Warranties ---
    @Query("SELECT * FROM warranties WHERE customerId = :userId ORDER BY expiresAt ASC")
    fun getCustomerWarrantiesFlow(userId: String): Flow<List<WarrantyEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWarranty(warranty: WarrantyEntity)

    @Update
    suspend fun updateWarranty(warranty: WarrantyEntity)

    // --- Spare Parts ---
    @Query("SELECT * FROM parts WHERE (:category IS NULL OR category = :category) ORDER BY rating DESC")
    fun getPartsFlow(category: String?): Flow<List<PartEntity>>

    @Query("SELECT * FROM parts WHERE id = :partId LIMIT 1")
    suspend fun getPartById(partId: String): PartEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertParts(parts: List<PartEntity>)

    // --- Transactions ---
    @Query("SELECT * FROM transactions WHERE userId = :userId ORDER BY createdAt DESC")
    fun getTransactionsFlow(userId: String): Flow<List<TransactionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: TransactionEntity)

    // --- Disputes ---
    @Query("SELECT * FROM disputes WHERE orderId = :orderId LIMIT 1")
    fun getDisputeForOrderFlow(orderId: String): Flow<DisputeEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDispute(dispute: DisputeEntity)

    // --- SOP Checklists ---
    @Query("SELECT * FROM sop_checklists WHERE category = :category LIMIT 1")
    suspend fun getSopChecklist(category: String): SopChecklistEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSopChecklists(checklists: List<SopChecklistEntity>)
}
