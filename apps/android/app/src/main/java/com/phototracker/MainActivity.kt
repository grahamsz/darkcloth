package com.phototracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.rememberNavController
import com.phototracker.data.AuthManager
import com.phototracker.ui.navigation.PhototrackerNavGraph
import com.phototracker.ui.navigation.Screen
import com.phototracker.ui.theme.PhototrackerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PhototrackerTheme {
                val navController = rememberNavController()
                val context = LocalContext.current
                val authManager = remember { AuthManager(context) }
                val startDestination = if (authManager.isLoggedIn()) Screen.Home.route else Screen.Login.route

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    PhototrackerNavGraph(navController = navController, startDestination = startDestination)
                }
            }
        }
    }
}
