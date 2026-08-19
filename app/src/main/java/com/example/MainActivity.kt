package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.DeviceHub
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.ui.screens.auth.OtpScreen
import com.example.ui.screens.auth.PhoneAuthScreen
import com.example.ui.screens.auth.SplashScreen
import com.example.ui.screens.devices.AddDeviceScreen
import com.example.ui.screens.devices.DevicePassportScreen
import com.example.ui.screens.devices.DevicesListScreen
import com.example.ui.screens.diagnosis.DiagnosisScreen
import com.example.ui.screens.home.HomeScreen
import com.example.ui.screens.orders.NewOrderScreen
import com.example.ui.screens.orders.OrderDetailScreen
import com.example.ui.screens.orders.OrderMatchingScreen
import com.example.ui.screens.orders.OrderTrackingScreen
import com.example.ui.screens.profile.ProfileScreen
import com.example.ui.screens.profile.SupportChatScreen
import com.example.ui.screens.secondary.PartsMarketplaceScreen
import com.example.ui.screens.secondary.WalletScreen
import com.example.ui.screens.secondary.WarrantyScreen
import com.example.ui.screens.technician.TechnicianDashboardScreen
import com.example.ui.screens.technician.TechnicianJobDetailScreen
import com.example.ui.theme.GoldAccent
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.TealPrimary
import com.example.ui.viewmodel.TamirkarViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                TamirkarApp()
            }
        }
    }
}

sealed class Screen(val route: String, val title: String = "", val icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    data object Splash : Screen("splash")
    data object AuthPhone : Screen("auth_phone")
    data object AuthOtp : Screen("auth_otp/{phone}") {
        fun createRoute(phone: String) = "auth_otp/$phone"
    }

    data object Home : Screen("home", "خانه", Icons.Default.Home)
    data object Devices : Screen("devices", "پاسپورت", Icons.Default.DeviceHub)
    data object Warranties : Screen("warranties", "ضمانت‌ها", Icons.Default.Security)
    data object Chat : Screen("chat", "دستیار AI", Icons.Default.Chat)
    data object Profile : Screen("profile", "حساب من", Icons.Default.Person)

    data object Diagnosis : Screen("diagnosis?cat={cat}") {
        fun createRoute(cat: String? = null) = if (cat != null) "diagnosis?cat=$cat" else "diagnosis"
    }

    data object NewOrder : Screen("new_order?cat={cat}&symptom={symptom}") {
        fun createRoute(cat: String? = null, symptom: String? = null) =
            "new_order?cat=${cat.orEmpty()}&symptom=${symptom.orEmpty()}"
    }

    data object OrderMatching : Screen("order_matching/{orderId}") {
        fun createRoute(orderId: String) = "order_matching/$orderId"
    }

    data object OrderTracking : Screen("order_tracking/{orderId}") {
        fun createRoute(orderId: String) = "order_tracking/$orderId"
    }

    data object OrderDetail : Screen("order_detail/{orderId}") {
        fun createRoute(orderId: String) = "order_detail/$orderId"
    }

    data object DevicePassport : Screen("device_passport/{deviceId}") {
        fun createRoute(deviceId: String) = "device_passport/$deviceId"
    }

    data object AddDevice : Screen("add_device")
    data object Parts : Screen("parts")
    data object Wallet : Screen("wallet")

    data object TechnicianDashboard : Screen("technician_dashboard")
    data object TechnicianJobDetail : Screen("technician_job_detail/{orderId}") {
        fun createRoute(orderId: String) = "technician_job_detail/$orderId"
    }
}

@Composable
fun TamirkarApp(
    viewModel: TamirkarViewModel = viewModel()
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val bottomBarScreens = listOf(
        Screen.Home,
        Screen.Devices,
        Screen.Warranties,
        Screen.Chat,
        Screen.Profile
    )

    val showBottomBar = currentRoute in bottomBarScreens.map { it.route }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp,
                    modifier = Modifier.testTag("bottom_nav_bar")
                ) {
                    bottomBarScreens.forEach { screen ->
                        val isSelected = currentRoute == screen.route
                        NavigationBarItem(
                            selected = isSelected,
                            onClick = {
                                if (currentRoute != screen.route) {
                                    navController.navigate(screen.route) {
                                        popUpTo(Screen.Home.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = {
                                screen.icon?.let {
                                    Icon(
                                        imageVector = it,
                                        contentDescription = screen.title,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            },
                            label = {
                                Text(
                                    text = screen.title,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = TealPrimary,
                                selectedTextColor = TealPrimary,
                                indicatorColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            NavHost(
                navController = navController,
                startDestination = Screen.Home.route
            ) {
                composable(Screen.Splash.route) {
                    SplashScreen(
                        onNavigateNext = { navController.navigate(Screen.Home.route) { popUpTo(Screen.Splash.route) { inclusive = true } } }
                    )
                }

                composable(Screen.AuthPhone.route) {
                    PhoneAuthScreen(
                        onSendOtp = { phone -> navController.navigate(Screen.AuthOtp.createRoute(phone)) }
                    )
                }

                composable(
                    Screen.AuthOtp.route,
                    arguments = listOf(navArgument("phone") { type = NavType.StringType })
                ) { entry ->
                    val phone = entry.arguments?.getString("phone") ?: ""
                    OtpScreen(
                        phoneNumber = phone,
                        onVerifySuccess = { navController.navigate(Screen.Home.route) { popUpTo(Screen.AuthPhone.route) { inclusive = true } } }
                    )
                }

                // --- Customer Main Tabs ---
                composable(Screen.Home.route) {
                    HomeScreen(
                        viewModel = viewModel,
                        onNavigateToDiagnosis = { cat -> navController.navigate(Screen.Diagnosis.createRoute(cat)) },
                        onNavigateToNewOrder = { cat -> navController.navigate(Screen.NewOrder.createRoute(cat)) },
                        onNavigateToOrderDetails = { orderId -> navController.navigate(Screen.OrderDetail.createRoute(orderId)) },
                        onNavigateToDevicePassport = { devId -> navController.navigate(Screen.DevicePassport.createRoute(devId)) },
                        onNavigateToAddDevice = { navController.navigate(Screen.AddDevice.route) },
                        onNavigateToDevicesList = { navController.navigate(Screen.Devices.route) },
                        onNavigateToWallet = { navController.navigate(Screen.Wallet.route) },
                        onNavigateToParts = { navController.navigate(Screen.Parts.route) },
                        onNavigateToWarranty = { navController.navigate(Screen.Warranties.route) }
                    )
                }

                composable(Screen.Devices.route) {
                    DevicesListScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() },
                        onNavigateToPassport = { devId -> navController.navigate(Screen.DevicePassport.createRoute(devId)) },
                        onNavigateToAddDevice = { navController.navigate(Screen.AddDevice.route) }
                    )
                }

                composable(Screen.Warranties.route) {
                    WarrantyScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() },
                        onNavigateToDispute = { orderId -> navController.navigate(Screen.OrderDetail.createRoute(orderId)) }
                    )
                }

                composable(Screen.Chat.route) {
                    SupportChatScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable(Screen.Profile.route) {
                    ProfileScreen(
                        viewModel = viewModel,
                        onNavigateToWallet = { navController.navigate(Screen.Wallet.route) },
                        onNavigateToDevices = { navController.navigate(Screen.Devices.route) },
                        onNavigateToWarranties = { navController.navigate(Screen.Warranties.route) },
                        onNavigateToParts = { navController.navigate(Screen.Parts.route) },
                        onNavigateToChat = { navController.navigate(Screen.Chat.route) },
                        onSwitchToTechnicianMode = { navController.navigate(Screen.TechnicianDashboard.route) }
                    )
                }

                // --- Booking & Diagnosis ---
                composable(
                    Screen.Diagnosis.route,
                    arguments = listOf(navArgument("cat") { type = NavType.StringType; nullable = true; defaultValue = null })
                ) { entry ->
                    val cat = entry.arguments?.getString("cat")
                    DiagnosisScreen(
                        viewModel = viewModel,
                        initialCategory = cat,
                        onBack = { navController.popBackStack() },
                        onProceedToBooking = { chosenCat, symptom ->
                            navController.navigate(Screen.NewOrder.createRoute(chosenCat, symptom))
                        }
                    )
                }

                composable(
                    Screen.NewOrder.route,
                    arguments = listOf(
                        navArgument("cat") { type = NavType.StringType; nullable = true; defaultValue = "" },
                        navArgument("symptom") { type = NavType.StringType; nullable = true; defaultValue = "" }
                    )
                ) { entry ->
                    val cat = entry.arguments?.getString("cat")
                    val symptom = entry.arguments?.getString("symptom")
                    NewOrderScreen(
                        viewModel = viewModel,
                        categoryArg = cat,
                        symptomArg = symptom,
                        onBack = { navController.popBackStack() },
                        onOrderSubmitted = { orderId ->
                            navController.navigate(Screen.OrderMatching.createRoute(orderId)) {
                                popUpTo(Screen.Home.route)
                            }
                        }
                    )
                }

                composable(
                    Screen.OrderMatching.route,
                    arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                ) { entry ->
                    val orderId = entry.arguments?.getString("orderId") ?: ""
                    OrderMatchingScreen(
                        viewModel = viewModel,
                        orderId = orderId,
                        onBack = { navController.popBackStack() },
                        onNavigateToTracking = { id -> navController.navigate(Screen.OrderTracking.createRoute(id)) }
                    )
                }

                composable(
                    Screen.OrderTracking.route,
                    arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                ) { entry ->
                    val orderId = entry.arguments?.getString("orderId") ?: ""
                    OrderTrackingScreen(
                        viewModel = viewModel,
                        orderId = orderId,
                        onBack = { navController.popBackStack() },
                        onNavigateToInvoice = { id -> navController.navigate(Screen.OrderDetail.createRoute(id)) },
                        onNavigateToChat = { navController.navigate(Screen.Chat.route) }
                    )
                }

                composable(
                    Screen.OrderDetail.route,
                    arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                ) { entry ->
                    val orderId = entry.arguments?.getString("orderId") ?: ""
                    OrderDetailScreen(
                        viewModel = viewModel,
                        orderId = orderId,
                        onBack = { navController.popBackStack() },
                        onNavigateToDispute = { id -> navController.navigate(Screen.OrderDetail.createRoute(id)) }
                    )
                }

                // --- Devices & Extras ---
                composable(
                    Screen.DevicePassport.route,
                    arguments = listOf(navArgument("deviceId") { type = NavType.StringType })
                ) { entry ->
                    val deviceId = entry.arguments?.getString("deviceId") ?: ""
                    DevicePassportScreen(
                        viewModel = viewModel,
                        deviceId = deviceId,
                        onBack = { navController.popBackStack() },
                        onRequestService = { cat -> navController.navigate(Screen.Diagnosis.createRoute(cat)) }
                    )
                }

                composable(Screen.AddDevice.route) {
                    AddDeviceScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() },
                        onDeviceAdded = { navController.popBackStack() }
                    )
                }

                composable(Screen.Parts.route) {
                    PartsMarketplaceScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() }
                    )
                }

                composable(Screen.Wallet.route) {
                    WalletScreen(
                        viewModel = viewModel,
                        onBack = { navController.popBackStack() }
                    )
                }

                // --- Technician Workspace ---
                composable(Screen.TechnicianDashboard.route) {
                    TechnicianDashboardScreen(
                        viewModel = viewModel,
                        onNavigateToJobDetail = { orderId -> navController.navigate(Screen.TechnicianJobDetail.createRoute(orderId)) },
                        onSwitchToCustomerMode = { navController.navigate(Screen.Home.route) }
                    )
                }

                composable(
                    Screen.TechnicianJobDetail.route,
                    arguments = listOf(navArgument("orderId") { type = NavType.StringType })
                ) { entry ->
                    val orderId = entry.arguments?.getString("orderId") ?: ""
                    TechnicianJobDetailScreen(
                        viewModel = viewModel,
                        orderId = orderId,
                        onBack = { navController.popBackStack() },
                        onJobFinished = { navController.navigate(Screen.TechnicianDashboard.route) { popUpTo(Screen.TechnicianDashboard.route) { inclusive = true } } }
                    )
                }
            }
        }
    }
}
