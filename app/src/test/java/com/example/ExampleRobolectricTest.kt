package com.example

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.example.data.local.TamirkarDatabase
import com.example.data.local.entities.DeviceEntity
import com.example.data.local.entities.OrderEntity
import com.example.data.local.entities.UserEntity
import com.example.domain.model.CurrencyHelper
import com.example.domain.model.DeviceCategory
import com.example.domain.model.OrderStatus
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

    private lateinit var db: TamirkarDatabase

    @Before
    fun createDb() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, TamirkarDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun closeDb() {
        db.close()
    }

    @Test
    fun testAppNamePersianResource() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("تعمیرکار", appName)
    }

    @Test
    fun testCurrencyFormattingTomans() {
        val amount = 1500000L
        val formatted = CurrencyHelper.formatTomans(amount)
        assertTrue(formatted.contains("تومان"))
        assertTrue(formatted.contains("میلیون"))

        // formatNumber renders the full value with Persian digits and grouping separators
        val full = CurrencyHelper.formatNumber(amount)
        assertTrue(full.contains("۱٬۵۰۰٬۰۰۰"))
    }

    @Test
    fun testEscrowFifteenPercentCalculation() {
        val labor = 800000L
        val parts = 400000L
        val total = labor + parts
        val escrow = (total * 0.15).toLong()
        assertEquals(180000L, escrow)
    }

    @Test
    fun testCategoryEnumResolution() {
        val ac = DeviceCategory.fromId("ac")
        assertEquals(DeviceCategory.AC, ac)
        assertEquals("کولر گازی و اسپلیت", ac.titleFa)

        val unknown = DeviceCategory.fromId("unknown_xyz")
        assertEquals(DeviceCategory.GENERAL, unknown)
    }

    @Test
    fun testDatabaseUserAndDevicePassportFlow() = runBlocking {
        val dao = db.tamirkarDao()

        val user = UserEntity(
            id = "test_user_1",
            phone = "09121112233",
            fullName = "حسین تهرانی",
            walletBalance = 5000000L
        )
        dao.insertUser(user)

        val fetchedUser = dao.getUser("test_user_1")
        assertNotNull(fetchedUser)
        assertEquals("حسین تهرانی", fetchedUser?.fullName)

        val device = DeviceEntity(
            id = "dev_test_1",
            userId = "test_user_1",
            name = "پکیج دیواری بوتان",
            category = "water_heater",
            brand = "بوتان",
            model = "Perla Pro",
            serialNumber = "BTN-1402-998",
            purchaseDate = "۱۴۰۲/۰۱/۱۵",
            purchasePrice = 18000000L,
            healthScore = 92
        )
        dao.insertDevice(device)

        val fetchedDevice = dao.getDeviceById("dev_test_1")
        assertNotNull(fetchedDevice)
        assertEquals(92, fetchedDevice?.healthScore)
        assertEquals("پکیج دیواری بوتان", fetchedDevice?.name)
    }

    @Test
    fun testOrderInsertionAndStatus() = runBlocking {
        val dao = db.tamirkarDao()
        val order = OrderEntity(
            id = "ord_test_99",
            orderNumber = "TK-999999",
            customerId = "test_user_1",
            category = "refrigerator",
            problemDescription = "فن یخچال کار نمی‌کند و بدنه داغ می‌شود",
            status = "pending",
            finalPrice = 1450000L
        )
        dao.insertOrder(order)

        val fetched = dao.getOrderById("ord_test_99")
        assertNotNull(fetched)
        assertEquals("TK-999999", fetched?.orderNumber)
        assertEquals(OrderStatus.PENDING, OrderStatus.fromId(fetched?.status ?: ""))
    }
}
