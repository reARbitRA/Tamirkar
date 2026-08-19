package com.example.ui.screens.devices

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeviceHub
import androidx.compose.material.icons.filled.Handyman
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.local.entities.DeviceEntity
import com.example.domain.model.CurrencyHelper
import com.example.domain.model.DeviceCategory
import com.example.ui.components.DeviceHealthCard
import com.example.ui.components.PersianTopBar
import com.example.ui.theme.EmeraldLight
import com.example.ui.theme.EmeraldSuccess
import com.example.ui.theme.GoldAccent
import com.example.ui.theme.GoldLight
import com.example.ui.theme.RoseAlert
import com.example.ui.theme.RoseLight
import com.example.ui.theme.SlateNavyDark
import com.example.ui.theme.TealContainer
import com.example.ui.theme.TealPrimary
import com.example.ui.theme.TealPrimaryDark
import com.example.ui.viewmodel.TamirkarViewModel

/**
 * 1. Devices List Screen (Digital Passport Hub)
 */
@Composable
fun DevicesListScreen(
    viewModel: TamirkarViewModel,
    onBack: () -> Unit,
    onNavigateToPassport: (String) -> Unit,
    onNavigateToAddDevice: () -> Unit
) {
    val devices by viewModel.devices.collectAsState()

    Scaffold(
        topBar = { PersianTopBar(title = "پاسپورت دیجیتال وسایل من", onBack = onBack) },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToAddDevice,
                containerColor = TealPrimary,
                contentColor = Color.White,
                modifier = Modifier.testTag("fab_add_device")
            ) {
                Icon(imageVector = Icons.Default.Add, contentDescription = "افزودن دستگاه جدید")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .testTag("screen_devices_list"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = TealContainer)
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.DeviceHub,
                            contentDescription = null,
                            tint = TealPrimary,
                            modifier = Modifier.size(32.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "شناسنامه فنی و پرونده سلامت وسایل",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TealPrimaryDark
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "تمام سوابق تعمیر، تعویض قطعه و هشدارهای نگهداری در این بخش ثبت می‌شود.",
                                style = MaterialTheme.typography.bodySmall,
                                color = TealPrimaryDark.copy(alpha = 0.8f)
                            )
                        }
                    }
                }
            }

            items(devices) { device ->
                DeviceHealthCard(
                    device = device,
                    onClick = { onNavigateToPassport(device.id) }
                )
            }
        }
    }
}

/**
 * 2. Device Passport Detail Screen
 */
@Composable
fun DevicePassportScreen(
    viewModel: TamirkarViewModel,
    deviceId: String,
    onBack: () -> Unit,
    onRequestService: (String) -> Unit
) {
    val devices by viewModel.devices.collectAsState()
    val device = devices.firstOrNull { it.id == deviceId } ?: devices.firstOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("screen_device_passport")
    ) {
        PersianTopBar(
            title = device?.name ?: "پاسپورت دیجیتال",
            onBack = onBack,
            actions = {
                IconButton(onClick = { device?.let { viewModel.deleteDevice(it.id); onBack() } }) {
                    Icon(imageVector = Icons.Default.Delete, contentDescription = "حذف", tint = RoseAlert)
                }
            }
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Passport Header Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, TealPrimary.copy(alpha = 0.4f)),
                    elevation = CardDefaults.cardElevation(3.dp)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = device?.name ?: "",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "${device?.brand} • ${device?.model}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Icon(
                                imageVector = Icons.Default.QrCode,
                                contentDescription = "QR",
                                tint = TealPrimary,
                                modifier = Modifier.size(44.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Key Specs Grid
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("امتیاز سلامت دستگاه", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                Text("${CurrencyHelper.formatNumber(device?.healthScore ?: 88)}٪ (عالی)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = EmeraldSuccess)
                            }
                            Column {
                                Text("تعداد دفعات سرویس", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                Text("${CurrencyHelper.formatNumber(device?.serviceCount ?: 2)} بار", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("ارزش تقریبی کالا", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                Text(CurrencyHelper.formatTomans(device?.purchasePrice ?: 35000000L), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Service History Timeline
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.History, contentDescription = null, tint = TealPrimary, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(text = "تاریخچه تعمیرات و سرویس‌ها", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Text(
                            text = device?.notes ?: "سرویس دوره‌ای انجام شده و کلیه قطعات بررسی گردید.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            // 1-Tap Book Repair for this Device
            item {
                Button(
                    onClick = { device?.let { onRequestService(it.category) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .testTag("btn_request_service_for_device"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                ) {
                    Icon(imageVector = Icons.Default.Handyman, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "ثبت درخواست سرویس برای این دستگاه",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

/**
 * 3. Add Device Screen
 */
@Composable
fun AddDeviceScreen(
    viewModel: TamirkarViewModel,
    onBack: () -> Unit,
    onDeviceAdded: () -> Unit
) {
    var name by remember { mutableStateOf("ماشین ظرفشویی ۱۴ نفره") }
    var category by remember { mutableStateOf("dishwasher") }
    var brand by remember { mutableStateOf("بوش (Bosch)") }
    var model by remember { mutableStateOf("SMS88TI02M") }
    var serialNumber by remember { mutableStateOf("BSH-DSH-2023-8841") }
    var purchaseDate by remember { mutableStateOf("۱۴۰۱/۰۵/۲۰") }
    var notes by remember { mutableStateOf("شامل ۲ سال گارانتی اولیه شرکتی") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("screen_add_device")
    ) {
        PersianTopBar(title = "ثبت وسیله در پاسپورت دیجیتال", onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("نام دستگاه (مثال: یخچال ساید سامسونگ)") },
                    modifier = Modifier.fillMaxWidth().testTag("input_device_name"),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                OutlinedTextField(
                    value = brand,
                    onValueChange = { brand = it },
                    label = { Text("برند سازنده") },
                    modifier = Modifier.fillMaxWidth().testTag("input_device_brand"),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                OutlinedTextField(
                    value = model,
                    onValueChange = { model = it },
                    label = { Text("مدل دستگاه") },
                    modifier = Modifier.fillMaxWidth().testTag("input_device_model"),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                OutlinedTextField(
                    value = serialNumber,
                    onValueChange = { serialNumber = it },
                    label = { Text("شماره سریال یا کد دستگاه (اختیاری)") },
                    modifier = Modifier.fillMaxWidth().testTag("input_device_serial"),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                OutlinedTextField(
                    value = purchaseDate,
                    onValueChange = { purchaseDate = it },
                    label = { Text("تاریخ تقریبی خرید") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("توضیحات و سوابق قبلی") },
                    modifier = Modifier.fillMaxWidth().height(100.dp),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            item {
                Button(
                    onClick = {
                        viewModel.addDevice(
                            name = name,
                            category = category,
                            brand = brand,
                            model = model,
                            serialNumber = serialNumber,
                            purchaseDate = purchaseDate,
                            price = 28000000L,
                            notes = notes,
                            onSuccess = onDeviceAdded
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .testTag("btn_save_device"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                ) {
                    Text(
                        text = "صدور و ثبت پاسپورت دیجیتال",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}
