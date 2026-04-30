package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.viewmodel.PhotoDetailViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoDetailScreen(
    id: String,
    onBack: () -> Unit,
    viewModel: PhotoDetailViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(id) {
        viewModel.loadPhoto(id)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Photograph Details") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("Back")
                    }
                }
            )
        }
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.error != null) {
            Box(modifier = Modifier.fillMaxSize().padding(innerPadding), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
            }
        } else {
            uiState.photo?.let { photo ->
                Column(modifier = Modifier.padding(innerPadding).padding(16.dp)) {
                    Text("Date: ${photo.takenAt ?: "Unknown"}", style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Notes: ${photo.notes ?: "None"}", style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Exposure", style = MaterialTheme.typography.headlineSmall)
                    Text("Aperture: ${photo.aperture ?: "???"}")
                    Text("Shutter Speed: ${photo.shutterSpeed ?: "???"}")
                    Text("ISO: ${photo.iso ?: "???"}")
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Location", style = MaterialTheme.typography.headlineSmall)
                    Text("Lat: ${photo.latitude ?: "???"}")
                    Text("Lon: ${photo.longitude ?: "???"}")
                }
            }
        }
    }
}
