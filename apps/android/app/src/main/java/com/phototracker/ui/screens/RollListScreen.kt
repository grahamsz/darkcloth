package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.data.model.Roll
import com.phototracker.viewmodel.RollViewModel

@Composable
fun RollListScreen(viewModel: RollViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Rolls",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(16.dp)
        )

        if (uiState.isLoading && uiState.rolls.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.error != null && uiState.rolls.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
            }
        } else {
            LazyColumn {
                items(uiState.rolls) { roll ->
                    RollItem(roll = roll)
                    Divider()
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadRolls()
    }
}

@Composable
fun RollItem(roll: Roll) {
    ListItem(
        headlineContent = { Text(roll.name) },
        supportingContent = { 
            Text("Loaded: ${roll.loadedAt ?: "Unknown"} | Developed: ${roll.developedAt ?: "No"}")
        }
    )
}
