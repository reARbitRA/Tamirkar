package com.example.ui.screens.diagnosis

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Handyman
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.util.Base64
import android.net.Uri
import com.example.domain.model.CurrencyHelper
import com.example.domain.model.DeviceCategory
import com.example.ui.components.CategoryCard
import com.example.ui.components.EscrowStampBadge
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
import com.example.ui.viewmodel.UiState

@Composable
fun DiagnosisScreen(
    viewModel: TamirkarViewModel,
    initialCategory: String?,
    onBack: () -> Unit,
    onProceedToBooking: (String, String) -> Unit
) {
    var selectedCategory by remember { mutableStateOf(initialCategory ?: "ac") }
    var symptomText by remember {
        mutableStateOf(
            if (initialCategory == "ac" || initialCategory == null) "کولر گازی روشن می‌شود ولی باد سرد نمی‌زند و کمپرسور بعد از ۵ دقیقه قطع می‌کند."
            else "دستگاه به درستی کار نمی‌کند و صدای غیرعادی دارد."
        )
    }
    val context = LocalContext.current
    var photoBase64 by remember { mutableStateOf<String?>(null) }
    var attachmentError by remember { mutableStateOf<String?>(null) }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val image = uri?.let { readDiagnosticImage(context.contentResolver, it) }
        if (uri != null && image == null) {
            photoBase64 = null
            attachmentError = "عکس باید کمتر از ۲ مگابایت باشد."
        } else {
            photoBase64 = image
            attachmentError = null
        }
    }

    val diagnosisState by viewModel.diagnosisState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .testTag("screen_diagnosis")
    ) {
        PersianTopBar(title = "عیب‌یابی هوشمند هوش مصنوعی", onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Category Selector
            item {
                Text(
                    text = "۱. انتخاب نوع دستگاه:",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Spacer(modifier = Modifier.height(10.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(DeviceCategory.entries) { cat ->
                        CategoryCard(
                            category = cat,
                            isSelected = selectedCategory == cat.id,
                            onClick = { selectedCategory = cat.id }
                        )
                    }
                }
            }

            // Symptom Description & Media
            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "۲. شرح مشکل یا صدای غیرعادی دستگاه:",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = symptomText,
                            onValueChange = { symptomText = it },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(120.dp)
                                .testTag("input_symptom"),
                            placeholder = { Text("علائم خرابی، بوی سوختگی، کد خطا یا صدای تق‌تق را بنویسید...") },
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = TealPrimary)
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (photoBase64 != null) TealContainer else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { photoPicker.launch("image/*") }
                                .testTag("btn_attach_photo")
                        ) {
                            Row(
                                modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.AddPhotoAlternate,
                                    contentDescription = null,
                                    tint = if (photoBase64 != null) TealPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (photoBase64 != null) "عکس برای تشخیص اولیه پیوست شد ✓" else "پیوست عکس دستگاه (اختیاری، حداکثر ۲ مگابایت)",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (photoBase64 != null) TealPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        attachmentError?.let { message ->
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(message, color = RoseAlert, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            // Run Diagnosis Button
            item {
                Button(
                    onClick = {
                        viewModel.runDiagnosis(selectedCategory, symptomText, photoBase64?.let { listOf(it) } ?: emptyList())
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                        .testTag("btn_run_diagnosis"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = TealPrimary)
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = GoldAccent,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "دریافت تشخیص اولیه",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            // Diagnosis Result Section
            when (val state = diagnosisState) {
                is UiState.Loading -> {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                        ) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                CircularProgressIndicator(color = TealPrimary)
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    text = "در حال ارسال درخواست تشخیص اولیه...",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = TealPrimary
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = "نتیجه غیرالزام‌آور است و جای بررسی حضوری را نمی‌گیرد.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
                is UiState.Success -> {
                    val result = state.data
                    item {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("card_diagnosis_result"),
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = BorderStroke(1.dp, TealPrimary.copy(alpha = 0.5f)),
                            elevation = CardDefaults.cardElevation(4.dp)
                        ) {
                            Column(modifier = Modifier.padding(18.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.CheckCircle,
                                            contentDescription = null,
                                            tint = EmeraldSuccess,
                                            modifier = Modifier.size(24.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "تشخیص اولیه",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = TealPrimary
                                        )
                                    }

                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = EmeraldLight
                                    ) {
                                        Text(
                                            text = "دقت ${CurrencyHelper.formatNumber(result.confidenceScore.toInt())}٪",
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Bold,
                                            color = EmeraldSuccess,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))

                                Text(
                                    text = result.summaryFa,
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )

                                Spacer(modifier = Modifier.height(14.dp))

                                // Probable Causes
                                Text(
                                    text = "علل احتمالی بروز نقص:",
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                result.probableCauses.forEach { cause ->
                                    Row(
                                        modifier = Modifier.padding(vertical = 3.dp),
                                        verticalAlignment = Alignment.Top
                                    ) {
                                        Text("• ", color = TealPrimary, fontWeight = FontWeight.Bold)
                                        Text(
                                            text = cause,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))

                                // Price Range in Tomans
                                Card(
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = TealContainer)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "هزینه تخمینی (دستمزد + قطعه):",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = TealPrimaryDark
                                        )
                                        Text(
                                            text = CurrencyHelper.formatPriceRange(result.estimatedPriceMin, result.estimatedPriceMax),
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = TealPrimary
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(14.dp))

                                // DIY Guide
                                if (result.diyPossible) {
                                    Card(
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(containerColor = EmeraldLight)
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp)) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(
                                                    imageVector = Icons.Default.Handyman,
                                                    contentDescription = null,
                                                    tint = EmeraldSuccess,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(
                                                    text = "اقدامات اولیه و عیب‌یابی ساده (DIY):",
                                                    style = MaterialTheme.typography.labelLarge,
                                                    fontWeight = FontWeight.Bold,
                                                    color = EmeraldSuccess
                                                )
                                            }
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text(
                                                text = result.diyGuideFa,
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = SlateNavyDark
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(14.dp))
                                }

                                // Safety Warnings
                                if (result.safetyWarnings.isNotEmpty()) {
                                    Card(
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(containerColor = RoseLight)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(12.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Warning,
                                                contentDescription = null,
                                                tint = RoseAlert,
                                                modifier = Modifier.size(20.dp)
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = result.safetyWarnings.first(),
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = RoseAlert,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(16.dp))
                                }

                                // Booking CTA Button
                                Button(
                                    onClick = {
                                        onProceedToBooking(selectedCategory, symptomText)
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(52.dp)
                                        .testTag("btn_proceed_booking"),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent)
                                ) {
                                    Text(
                                        text = "ثبت درخواست بررسی حضوری (پس از فعال‌سازی سرویس)",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = SlateNavyDark
                                    )
                                }
                            }
                        }
                    }
                }
                is UiState.Error -> {
                    item {
                        Card(
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = RoseLight)
                        ) {
                            Text(
                                text = state.message,
                                color = RoseAlert,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                    }
                }
                is UiState.Idle -> {}
            }
        }
    }
}

private fun readDiagnosticImage(contentResolver: android.content.ContentResolver, uri: Uri): String? = runCatching {
    contentResolver.openInputStream(uri)?.use { stream ->
        val bytes = stream.readBytes()
        if (bytes.isEmpty() || bytes.size > 2 * 1024 * 1024) null else Base64.encodeToString(bytes, Base64.NO_WRAP)
    }
}.getOrNull()
