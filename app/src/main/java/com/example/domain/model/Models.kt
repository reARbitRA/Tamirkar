package com.example.domain.model

import java.text.NumberFormat
import java.util.Locale

/**
 * Core Domain Enums & Models for Tamirkar (تعمیرکار)
 * All prices are represented in Tomans (تومان) as Long integers.
 */

enum class DeviceCategory(val id: String, val titleFa: String, val iconName: String) {
    MOBILE("mobile", "موبایل و تبلت", "phone_android"),
    LAPTOP("laptop", "لپ‌تاپ و کامپیوتر", "laptop"),
    AC("ac", "کولر گازی و اسپلیت", "ac_unit"),
    WASHER("washer", "ماشین لباسشویی", "local_laundry_service"),
    REFRIGERATOR("refrigerator", "یخچال و فریزر", "kitchen"),
    TV("tv", "تلویزیون و صوتی", "tv"),
    CAR("car", "خودرو و مکانیکی", "directions_car"),
    DISHWASHER("dishwasher", "ماشین ظرفشویی", "countertops"),
    WATER_HEATER("water_heater", "پکیج و آبگرمکن", "water_damage"),
    GENERAL("general", "سایر لوازم برقی", "build");

    companion object {
        fun fromId(id: String): DeviceCategory = entries.firstOrNull { it.id == id } ?: GENERAL
    }
}

enum class QualityLevel(val id: String, val titleFa: String, val badgeColorHex: Long) {
    ORIGINAL("original", "اصلی (اورجینال)", 0xFF0D9488),
    GRADE_A("grade_a", "درجه یک (شرکتی)", 0xFF2563EB),
    ECONOMY("economy", "اقتصادی", 0xFF64748B);

    companion object {
        fun fromId(id: String): QualityLevel = entries.firstOrNull { it.id == id } ?: GRADE_A
    }
}

enum class TechnicianLevel(val id: String, val titleFa: String, val commissionRate: Float, val minXp: Int) {
    APPRENTICE("apprentice", "کارآموز", 0.20f, 0),
    SPECIALIST("specialist", "متخصص", 0.16f, 1000),
    MASTER("master", "استادکار", 0.14f, 5000),
    SUPERSTAR("superstar", "سوپراستار", 0.12f, 10000);

    companion object {
        fun fromId(id: String): TechnicianLevel = entries.firstOrNull { it.id == id } ?: APPRENTICE
    }
}

enum class OrderStatus(val id: String, val titleFa: String, val stepIndex: Int) {
    PENDING("pending", "در انتظار بررسی", 0),
    AI_ANALYZING("ai_analyzing", "تحلیل هوش مصنوعی", 0),
    MATCHING("matching", "در حال یافتن نزدیک‌ترین متخصص", 1),
    WAITING_BIDS("waiting_bids", "در انتظار دریافت پیشنهادات", 1),
    ACCEPTED("accepted", "متخصص انتخاب شد", 2),
    ON_WAY("on_way", "متخصص در راه است", 2),
    ARRIVED("arrived", "متخصص در محل حاضر است", 3),
    DIAGNOSING("diagnosing", "عیب‌یابی تخصصی در محل", 3),
    REPAIRING("repairing", "در حال انجام تعمیر", 4),
    COMPLETED("completed", "تعمیر پایان یافت و ضمانت فعال شد", 5),
    CANCELLED("cancelled", "لغو شده", -1),
    DISPUTED("disputed", "در حال داوری اختلاف", -1);

    companion object {
        fun fromId(id: String): OrderStatus = entries.firstOrNull { it.id == id } ?: PENDING
    }
}

enum class OrderMode(val id: String, val titleFa: String, val descFa: String) {
    FAST("fast", "اعزام سریع هوشمند", "سیستم بهترین متخصص نزدیک با بالاترین امتیاز را فوراً اعزام می‌کند."),
    BIDDING("bidding", "مناقصه و استعلام قیمت", "تعمیرکاران برتر قیمت‌های پیشنهادی خود را ارسال می‌کنند.");

    companion object {
        fun fromId(id: String): OrderMode = entries.firstOrNull { it.id == id } ?: FAST
    }
}

enum class WarrantyStatus(val id: String, val titleFa: String) {
    ACTIVE("active", "فعال و معتبر"),
    CLAIMED("claimed", "درخواست استفاده از ضمانت"),
    EXPIRED("expired", "منقضی شده"),
    VOID("void", "باطل شده");

    companion object {
        fun fromId(id: String): WarrantyStatus = entries.firstOrNull { it.id == id } ?: ACTIVE
    }
}

/**
 * Currency and Iranian number formatting utilities
 */
object CurrencyHelper {
    private val faNumberFormatter = NumberFormat.getInstance(Locale("fa", "IR"))

    fun formatTomans(amount: Long): String {
        return when {
            amount >= 1_000_000 -> {
                val millions = amount / 1_000_000.0
                if (millions % 1.0 == 0.0) {
                    "${faNumberFormatter.format(millions.toLong())} میلیون تومان"
                } else {
                    "${String.format(Locale("fa", "IR"), "%.1f", millions)} میلیون تومان"
                }
            }
            amount >= 1_000 -> {
                val thousands = (amount / 1_000.0)
                if (thousands % 1.0 == 0.0) {
                    "${faNumberFormatter.format(thousands.toLong())} هزار تومان"
                } else {
                    "${faNumberFormatter.format(amount)} تومان"
                }
            }
            else -> "${faNumberFormatter.format(amount)} تومان"
        }
    }

    fun formatNumber(number: Number): String {
        return faNumberFormatter.format(number)
    }

    fun formatPriceRange(min: Long, max: Long): String {
        return "از ${formatTomans(min)} تا ${formatTomans(max)}"
    }
}
