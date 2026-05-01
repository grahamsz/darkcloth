package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.viewmodel.PhotoDetailViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoDetailScreen(
    id: String,
    onBack: () -> Unit,
    onEdit: () -> Unit = {},
    viewModel: PhotoDetailViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(id) { viewModel.loadPhoto(id) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Photograph") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit")
                    }
                }
            )
        }
    ) { innerPadding ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }
            }
            uiState.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) { Text(uiState.error!!, color = MaterialTheme.colorScheme.error) }
            }
            else -> uiState.photo?.let { photo ->
                Column(
                    modifier = Modifier
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (photo.notes != null) {
                        Text(photo.notes, style = MaterialTheme.typography.bodyLarge)
                    }

                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            DetailSectionHeader("Exposure")
                            DetailRow("Aperture", photo.aperture)
                            DetailRow("Shutter Speed", photo.shutterSpeed)
                            DetailRow("ISO", photo.iso?.toString())
                            DetailRow("Exp Comp", photo.exposureCompensation)
                            DetailRow("Focal Length", photo.focalLengthMm?.let { "${it}mm" })
                        }
                    }

                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            DetailSectionHeader("Frame")
                            DetailRow("Frame #", photo.frameNumber)
                            DetailRow("Date", photo.takenAt)
                        }
                    }

                    if (photo.latitude != null || photo.longitude != null) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                DetailSectionHeader("Location")
                                DetailRow("Latitude", photo.latitude?.toString())
                                DetailRow("Longitude", photo.longitude?.toString())
                                DetailRow("Altitude", photo.altitudeM?.let { "${it}m" })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailSectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun DetailRow(label: String, value: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value ?: "—", style = MaterialTheme.typography.bodySmall)
    }
}
