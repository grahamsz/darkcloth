package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.viewmodel.AddPhotoViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddPhotoScreen(
    onBack: () -> Unit,
    viewModel: AddPhotoViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val scrollState = rememberScrollState()

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Log Photograph") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("Back")
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(scrollState)
        ) {
            TextField(
                value = uiState.frameNumber,
                onValueChange = { viewModel.updateFrameNumber(it) },
                label = { Text("Frame Number") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            TextField(
                value = uiState.notes,
                onValueChange = { viewModel.updateNotes(it) },
                label = { Text("Notes") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))

            Row {
                TextField(
                    value = uiState.aperture,
                    onValueChange = { viewModel.updateAperture(it) },
                    label = { Text("Aperture") },
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                TextField(
                    value = uiState.shutterSpeed,
                    onValueChange = { viewModel.updateShutterSpeed(it) },
                    label = { Text("Shutter") },
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Row {
                TextField(
                    value = uiState.iso?.toString() ?: "",
                    onValueChange = { viewModel.updateIso(it.toIntOrNull()) },
                    label = { Text("ISO") },
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                TextField(
                    value = uiState.exposureCompensation,
                    onValueChange = { viewModel.updateExposureCompensation(it) },
                    label = { Text("Exp. Comp.") },
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))

            Text("GPS: ${uiState.latitude ?: "???"}, ${uiState.longitude ?: "???"}")
            Button(onClick = { viewModel.captureLocation() }) {
                Text("Refresh Location")
            }
            Spacer(modifier = Modifier.height(32.dp))

            if (uiState.error != null) {
                Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.height(8.dp))
            }

            Button(
                onClick = { viewModel.save() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                } else {
                    Text("Save Photograph")
                }
            }
        }
    }
}
