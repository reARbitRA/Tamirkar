package com.example.ui.screens.technician

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
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Engineering
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import com.example.domain.model.CurrencyHelper
import com.example.ui.components.PersianTopBar
import com.example.ui.theme.EmeraldLight
import com.example.ui.theme.EmeraldSuccess
import com.example.ui.theme.GoldAccent
import com.example.ui.theme.GoldLight
import com.example.ui.theme.SlateNavyDark
import com.example.ui.theme.TealContainer
import com.example.ui.theme.TealPrimary
import com.example.ui.theme.TealPrimaryDark
import com.example.ui.viewmodel.TamirkarViewModel
import com.example.ui.viewmodel.UiState

/**
 * 1. Technician Dashboard & Active Job Board
 */
@Composable
fun TechnicianDashboardScreen(
    viewModel: TamirkarViewModel,
    onNavigateToJobDetail: (String) -> Unit,
    onSwitchToCustomerMode: () -> Unit
) {
    var isOnline by remember { mutableStateOf(true) }
    val orders by viewModel.customerOrders.collectAsState()
    val activeJob = orders.firstOrNull { it.status == "accepted" || it.status == "repairing" || it.status == "arrived" }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("screen_technician_dashboard")
    ) {
        PersianTopBar(
            title = "میز کار استادکار (تکنسین)",
            actions = {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = TealContainer,
                    modifier = Modifier.clickable {
                        viewModel.setAppMode("customer")
                        onSwitchToCustomerMode()
                    }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "حالت مشتری",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = TealPrimary
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(imageVector = Icons.Default.SwapHoriz, contentDescription = null, tint = TealPrimary, modifier = Modifier.size(16.dp))
                    }
                }
            }
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Online/Offline Status Switcher Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isOnline) TealPrimaryDark else SlateNavyDark
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = if (isOnline) "وضعیت: آماده دریافت سفارش (آنلاین)" else "وضعیت: غیرفعال (آفلاین)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "سطح استادکار ممتاز • کمیسیون ۱۴٪ با پوشش صندوق امانی",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.8f)
                            )
                        }

                        Switch(
                            checked = isOnline,
                            onCheckedChange = { isOnline = it },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = GoldAccent,
                                checkedTrackColor = TealPrimary
                            ),
                            modifier = Modifier.testTag("switch_technician_online")
                        )
                    }
                }
            }

            // Stats / Earnings Cards
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Card(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text("درآمد امروز", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(CurrencyHelper.formatTomans(2450000L), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = TealPrimary)
                        }
                    }

                    Card(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text("امتیاز کیفی AI QC", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("۹۸.۵٪ (عالی)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = EmeraldSuccess)
                        }
                    }
                }
            }

            // Active Job Header
            item {
                Text(
                    text = "سفارشات نیازمند اقدام شما",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            // Active Job Card
            if (activeJob != null) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onNavigateToJobDetail(activeJob.id) }
                            .testTag("card_tech_active_job"),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, TealPrimary),
                        elevation = CardDefaults.cardElevation(3.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "سفارش ${activeJob.orderNumber}",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                Surface(shape = RoundedCornerShape(6.dp), color = TealContainer) {
                                    Text(
                                        text = "در حال اجرا",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TealPrimary,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Text(
                                text = activeJob.problemDescription,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            Text(
                                text = "آدرس: ${activeJob.customerAddress}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(14.dp))

                            Button(
                                onClick = { onNavigateToJobDetail(activeJob.id) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                            ) {
                                Icon(imageVector = Icons.Default.Checklist, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("ثبت چک‌لیست SOP و اتمام کار")
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 2. Technician Job Completion & SOP Checklist Screen (AI QC Audit)
 */
@Composable
fun TechnicianJobDetailScreen(
    viewModel: TamirkarViewModel,
    orderId: String,
    onBack: () -> Unit,
    onJobFinished: () -> Unit
) {
    var laborCostText by remember { mutableStateOf("750000") }
    var partsCostText by remember { mutableStateOf("450000") }
    var techNotes by remember { mutableStateOf("تعویض خازن راه‌انداز کمپرسور و شستشوی کندانسور طبق استاندارد SOP") }
    var hasBeforePhoto by remember { mutableStateOf(true) }
    var hasAfterPhoto by remember { mutableStateOf(true) }

    val sopChecklist = remember {
        mutableStateListOf(
            "قطع کامل برق ورودی و رعایت اصول ایمنی" to true,
            "تست فشار گاز و ولتاژ ترمینال" to true,
            "استفاده از قطعه اورجینال دارای برچسب هولوگرام" to true,
            "تست ۱۰ دقیقه‌ای کارکرد سرد و اندازه‌گیری جریان" to true
        )
    }

    val qcState by viewModel.qcResult.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("screen_tech_job_detail")
    ) {
        PersianTopBar(title = "تکمیل کار و چک‌لیست SOP", onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // SOP Checklist Item
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Checklist, contentDescription = null, tint = TealPrimary, modifier = Modifier.size(22.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("چک‌لیست الزامی استاندارد (SOP):", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        sopChecklist.forEachIndexed { index, (itemText, isChecked) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { sopChecklist[index] = itemText to !isChecked }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = isChecked,
                                    onCheckedChange = { sopChecklist[index] = itemText to it },
                                    colors = CheckboxDefaults.colors(checkedColor = TealPrimary)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(itemText, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }

            // Photo Evidence
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("عکس قبل و بعد از تعمیر (الزامی برای هوش مصنوعی QC):", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = TealContainer,
                                modifier = Modifier.weight(1f).padding(8.dp)
                            ) {
                                Text("عکس قبل از کار ✓", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = TealPrimary)
                            }
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = TealContainer,
                                modifier = Modifier.weight(1f).padding(8.dp)
                            ) {
                                Text("عکس بعد از کار ✓", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = TealPrimary)
                            }
                        }
                    }
                }
            }

            // Pricing Inputs
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("صورت‌حساب نهایی مشتری (تومان):", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = laborCostText,
                            onValueChange = { laborCostText = it },
                            label = { Text("اجرت و دستمزد (تومان)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = partsCostText,
                            onValueChange = { partsCostText = it },
                            label = { Text("هزینه قطعات مصرفی (تومان)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = techNotes,
                            onValueChange = { techNotes = it },
                            label = { Text("گزارش فنی انجام کار") },
                            modifier = Modifier.fillMaxWidth().height(100.dp),
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                }
            }

            // AI QC & Complete Button
            item {
                Button(
                    onClick = {
                        val labor = laborCostText.toLongOrNull() ?: 750000L
                        val parts = partsCostText.toLongOrNull() ?: 450000L
                        viewModel.completeTechnicianJob(orderId, parts, labor, techNotes) {
                            onJobFinished()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                        .testTag("btn_submit_job_completion"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent)
                ) {
                    Icon(imageVector = Icons.Default.AutoAwesome, contentDescription = null, tint = SlateNavyDark)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "ارزیابی با هوش مصنوعی و ثبت نهایی",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = SlateNavyDark
                    )
                }
            }

            // QC Result Feedback
            when (val q = qcState) {
                is UiState.Loading -> {
                    item {
                        CircularProgressIndicator(color = TealPrimary)
                    }
                }
                is UiState.Success -> {
                    item {
                        Card(
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = EmeraldLight)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text("تأییدیه کنترل کیفی AI: امتیاز ${q.data.qualityScore} از ۱۰۰", fontWeight = FontWeight.Bold, color = EmeraldSuccess)
                                Text(q.data.feedbackFa, color = SlateNavyDark)
                            }
                        }
                    }
                }
                else -> {}
            }
        }
    }
}
