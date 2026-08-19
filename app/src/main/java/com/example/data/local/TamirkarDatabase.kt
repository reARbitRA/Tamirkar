package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        UserEntity::class,
        TechnicianEntity::class,
        DeviceEntity::class,
        OrderEntity::class,
        BidEntity::class,
        WarrantyEntity::class,
        PartEntity::class,
        TransactionEntity::class,
        DisputeEntity::class,
        SopChecklistEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class TamirkarDatabase : RoomDatabase() {

    abstract fun tamirkarDao(): TamirkarDao

    companion object {
        @Volatile
        private var INSTANCE: TamirkarDatabase? = null

        fun getDatabase(context: Context): TamirkarDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    TamirkarDatabase::class.java,
                    "tamirkar_database"
                )
                    .addCallback(DatabaseCallback())
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }

        private class DatabaseCallback : Callback() {
            override fun onCreate(db: SupportSQLiteDatabase) {
                super.onCreate(db)
                INSTANCE?.let { database ->
                    CoroutineScope(Dispatchers.IO).launch {
                        populateInitialSeedData(database.tamirkarDao())
                    }
                }
            }
        }

        suspend fun populateInitialSeedData(dao: TamirkarDao) {
            // 1. Initial User
            val sampleUser = UserEntity(
                id = "user_default",
                phone = "09123456789",
                fullName = "علیرضا رضایی",
                role = "customer",
                walletBalance = 3200000L, // 3.2M Tomans
                escrowBalance = 450000L,  // 450k Tomans in Escrow
                city = "تهران",
                totalOrders = 4
            )
            dao.insertUser(sampleUser)

            // 2. Verified Technicians in Tehran
            val technicians = listOf(
                TechnicianEntity(
                    id = "tech_1",
                    userId = "user_tech_1",
                    fullName = "مهندس مجید کریمی",
                    specialties = "ac,refrigerator,water_heater",
                    experienceYears = 12,
                    rating = 4.95f,
                    totalJobs = 340,
                    completedJobs = 338,
                    warrantyComplianceRate = 99.2f,
                    avgResponseMinutes = 15,
                    level = "superstar",
                    xpPoints = 12400,
                    commissionRate = 0.12f,
                    bio = "فوق‌تخصص سرمایشی و برودتی ال‌جی و سامسونگ، دارنده مدال طلای مهارت"
                ),
                TechnicianEntity(
                    id = "tech_2",
                    userId = "user_tech_2",
                    fullName = "استاد علی حسینی",
                    specialties = "washer,dishwasher,refrigerator",
                    experienceYears = 9,
                    rating = 4.88f,
                    totalJobs = 210,
                    completedJobs = 206,
                    warrantyComplianceRate = 97.8f,
                    avgResponseMinutes = 20,
                    level = "master",
                    xpPoints = 7800,
                    commissionRate = 0.14f,
                    bio = "تعمیرکار ارشد برد و الکترونیک لوازم خانگی بوش و آاگ با قطعات فابریک"
                ),
                TechnicianEntity(
                    id = "tech_3",
                    userId = "user_tech_3",
                    fullName = "مهندس سینا مرادی",
                    specialties = "mobile,laptop",
                    experienceYears = 7,
                    rating = 4.92f,
                    totalJobs = 185,
                    completedJobs = 184,
                    warrantyComplianceRate = 98.9f,
                    avgResponseMinutes = 18,
                    level = "specialist",
                    xpPoints = 4600,
                    commissionRate = 0.16f,
                    bio = "متخصص تعویض هارد، آی‌سی تغذیه و فلت نمایشگر آیفون و سامسونگ"
                ),
                TechnicianEntity(
                    id = "tech_4",
                    userId = "user_tech_4",
                    fullName = "استاد بهروز کاظمی",
                    specialties = "tv,general",
                    experienceYears = 15,
                    rating = 4.82f,
                    totalJobs = 410,
                    completedJobs = 402,
                    warrantyComplianceRate = 96.5f,
                    avgResponseMinutes = 30,
                    level = "master",
                    xpPoints = 8900,
                    commissionRate = 0.14f,
                    bio = "کارشناس تخصصی بک‌لایت و پنل تلویزیون‌های سونی، ال‌جی و دوو"
                )
            )
            dao.insertTechnicians(technicians)

            // 3. User Devices (Digital Passport)
            val devices = listOf(
                DeviceEntity(
                    id = "dev_1",
                    userId = "user_default",
                    name = "کولر گازی ۲۴۰۰۰ اینورتر",
                    category = "ac",
                    brand = "ال‌جی (LG)",
                    model = "ArtCool Mirror 24K",
                    serialNumber = "LG-AC-2022-8419",
                    purchaseDate = "۱۴۰۱/۰۳/۱۰",
                    purchasePrice = 42000000L,
                    healthScore = 92,
                    lastServiceDate = "۱۴۰۳/۰۲/۱۵",
                    serviceCount = 2,
                    notes = "گاز R410A تازه شارژ شده، فیلترها شستشو و اوپراتور جرم‌گیری شده است."
                ),
                DeviceEntity(
                    id = "dev_2",
                    userId = "user_default",
                    name = "ماشین لباسشویی ۹ کیلویی",
                    category = "washer",
                    brand = "بوش (Bosch)",
                    model = "Serie 8 WAV28M90",
                    serialNumber = "BSH-WSH-9812",
                    purchaseDate = "۱۴۰۰/۰۸/۲۲",
                    purchasePrice = 38000000L,
                    healthScore = 68,
                    lastServiceDate = "۱۴۰۲/۰۶/۱۰",
                    serviceCount = 3,
                    notes = "تسمه و بلبرینگ دیگ نیاز به بازبینی دارد (صدای خشک در دور خشک‌کن)."
                ),
                DeviceEntity(
                    id = "dev_3",
                    userId = "user_default",
                    name = "یخچال فریزر ساید بای ساید",
                    category = "refrigerator",
                    brand = "سامسونگ (Samsung)",
                    model = "French Door RS50",
                    serialNumber = "SAM-REF-4011",
                    purchaseDate = "۱۳۹۹/۱۱/۰۵",
                    purchasePrice = 65000000L,
                    healthScore = 85,
                    lastServiceDate = "۱۴۰۲/۱۱/۲۰",
                    serviceCount = 1,
                    notes = "فیلتر آب تصفیه داخلی باید تا ۱ ماه دیگر تعویض گردد."
                )
            )
            devices.forEach { dao.insertDevice(it) }

            // 4. Sample Active Orders
            val sampleOrder = OrderEntity(
                id = "order_sample_1",
                orderNumber = "TK-140305-9214",
                customerId = "user_default",
                technicianId = "tech_1",
                deviceId = "dev_1",
                category = "ac",
                problemDescription = "باد کولر خنک نیست و یونیت خارجی صدای نامتعارف دارد.",
                aiDiagnosisSummary = "احتمال ۹۰٪ نشتی خفیف گاز مبرد R410A یا خرابی خازن راه‌انداز کمپرسور.",
                aiConfidenceScore = 94f,
                estimatedPriceMin = 750000L,
                estimatedPriceMax = 1600000L,
                finalPrice = 1200000L,
                partsCost = 450000L,
                laborCost = 750000L,
                escrowAmount = 180000L,
                platformCommission = 90000L,
                status = "repairing",
                orderMode = "fast",
                warrantyDays = 60,
                qualityScore = 95
            )
            dao.insertOrder(sampleOrder)

            // 5. Active Warranties
            val sampleWarranty = WarrantyEntity(
                id = "warr_1",
                orderId = "order_sample_1",
                deviceId = "dev_1",
                deviceName = "کولر گازی ۲۴۰۰۰ اینورتر ال‌جی",
                customerId = "user_default",
                technicianId = "tech_1",
                technicianName = "مهندس مجید کریمی",
                warrantyDays = 60,
                escrowAmount = 180000L,
                status = "active"
            )
            dao.insertWarranty(sampleWarranty)

            // 6. Spare Parts Catalog
            val parts = listOf(
                PartEntity(
                    id = "part_1",
                    name = "کمپرسور روتاری ۲۴۰۰۰ اینورتر ال‌جی",
                    nameEn = "LG 24K Inverter Rotary Compressor",
                    category = "ac",
                    brand = "LG Original",
                    compatibleModels = "کولرهای گازی ال‌جی و گری ۱۸ تا ۲۴ هزار",
                    qualityLevel = "original",
                    price = 8500000L,
                    stockQuantity = 8,
                    rating = 4.95f,
                    warrantyDays = 180,
                    description = "کمپرسور فابریک کره‌ای همراه با گاز تست کارخانه‌ای و پلمپ اصالت"
                ),
                PartEntity(
                    id = "part_2",
                    name = "پمپ تخلیه ماشین لباسشویی بوش",
                    nameEn = "Bosch Washing Machine Drain Pump",
                    category = "washer",
                    brand = "Askoll Italy",
                    compatibleModels = "سری ۴، ۶ و ۸ ماشین لباسشویی بوش و زیمنس",
                    qualityLevel = "original",
                    price = 980000L,
                    stockQuantity = 24,
                    rating = 4.88f,
                    warrantyDays = 90,
                    description = "پمپ ۳ خار اصلی ساخت ایتالیا با سیم‌پیچ ۱۰۰٪ مس بدون صدا"
                ),
                PartEntity(
                    id = "part_3",
                    name = "فیلتر کربن فعال ساید بای ساید سامسونگ",
                    nameEn = "Samsung Carbon Water Filter",
                    category = "refrigerator",
                    brand = "AquaPure",
                    compatibleModels = "تمامی مدل‌های ساید فرانسوی و رومانو سامسونگ",
                    qualityLevel = "grade_a",
                    price = 480000L,
                    stockQuantity = 45,
                    rating = 4.75f,
                    warrantyDays = 60,
                    description = "فیلتر درجه یک با استانداردهای NSF و حذف ۹۹٪ کلر و رسوبات"
                ),
                PartEntity(
                    id = "part_4",
                    name = "تاچ ال‌سی‌دی سوپر آمولد گلکسی S23 Ultra",
                    nameEn = "Samsung Galaxy S23 Ultra Dynamic AMOLED 2X",
                    category = "mobile",
                    brand = "Samsung Service Pack",
                    compatibleModels = "Samsung Galaxy S23 Ultra (SM-S918B)",
                    qualityLevel = "original",
                    price = 14200000L,
                    stockQuantity = 5,
                    rating = 4.98f,
                    warrantyDays = 120,
                    description = "صفحه نمایش سرویس‌پک فابریک سامسونگ همراه با فریم تیتانیوم"
                ),
                PartEntity(
                    id = "part_5",
                    name = "مجموعه بک‌لایت تلویزیون ۵۵ اینچ سونی 4K",
                    nameEn = "Sony 55 Inch Direct LED Backlight",
                    category = "tv",
                    brand = "Sony Certified",
                    compatibleModels = "Sony KD-55X8000G / X8500G",
                    qualityLevel = "grade_a",
                    price = 1850000L,
                    stockQuantity = 12,
                    rating = 4.80f,
                    warrantyDays = 90,
                    description = "شاخه ال‌ای‌دی آلومینیومی خنک‌شونده جهت جلوگیری از داغی مجدد"
                )
            )
            dao.insertParts(parts)

            // 7. Initial Transactions
            val transactions = listOf(
                TransactionEntity(
                    id = "tx_1",
                    userId = "user_default",
                    type = "payment",
                    amount = 1200000L,
                    balanceBefore = 4400000L,
                    balanceAfter = 3200000L,
                    description = "پرداخت هزینه تعمیر کولر گازی ۲۴۰۰۰ اینورتر",
                    referenceId = "ZP-94810238"
                ),
                TransactionEntity(
                    id = "tx_2",
                    userId = "user_default",
                    type = "escrow_hold",
                    amount = 180000L,
                    balanceBefore = 0L,
                    balanceAfter = 180000L,
                    description = "قفل وجه ضمانت ۱۵٪ در صندوق امن تا پایان مهلت گارانتی",
                    referenceId = "ESC-88319"
                )
            )
            transactions.forEach { dao.insertTransaction(it) }

            // 8. SOP Checklists
            val checklists = listOf(
                SopChecklistEntity(
                    id = "sop_ac",
                    category = "ac",
                    title = "چک‌لیست استاندارد سرویس و تعمیر کولر گازی",
                    stepsJson = """[
                        "قطع کامل فیوز مینیاتوری اصلی قبل از باز کردن قاب",
                        "عکس‌برداری باکیفیت از وضعیت قبل از شروع تعمیر",
                        "تست فشار گیج گاز مبرد و ثبت عدد Bar/PSI",
                        "بررسی سلامت خازن راه‌انداز با مولتی‌متر (میکروفاراد)",
                        "شستشوی فیلتر و رادیاتور کندانسور با اسپری مخصوص",
                        "عکس‌برداری واضح از قطعه تعویض‌شده در کنار قطعه نو",
                        "تست سرمادهی نهایی و اندازه‌گیری دمای دهانه خروجی (زیر ۱۲ درجه)",
                        "امضای فاکتور دیجیتال و ارائه ضمانت‌نامه ۶۰ روزه"
                    ]"""
                ),
                SopChecklistEntity(
                    id = "sop_washer",
                    category = "washer",
                    title = "چک‌لیست استاندارد سرویس و تعمیر ماشین لباسشویی",
                    stepsJson = """[
                        "قطع دوشاخه برق و بستن شیر ورودی آب سرد/گرم",
                        "عکس‌برداری از وضعیت دستگاه و کد خطای پنل",
                        "تخلیه فیلتر پایین و بررسی عدم انسداد پروانه پمپ تخلیه",
                        "بررسی تسمه، لرزه‌گیرهای فنری و بالانس دیگ استیل",
                        "تست سلامت هیدروستات و المنت گرم‌کننده با اهم‌متر",
                        "عکس‌برداری نهایی از نصب صحیح قطعه و شیلنگ‌های آب‌بندی",
                        "اجرای برنامه تست چرخش سریع (Spin) به مدت ۵ دقیقه"
                    ]"""
                )
            )
            dao.insertSopChecklists(checklists)
        }
    }
}
