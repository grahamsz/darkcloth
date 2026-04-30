package com.phototracker.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.data.model.Photograph
import com.phototracker.viewmodel.PhotoViewModel

@Composable
fun PhotoListScreen(
    onPhotoClick: (String) -> Unit,
    viewModel: PhotoViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Photographs",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(16.dp)
        )

        if (uiState.isLoading && uiState.photos.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.error != null && uiState.photos.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(uiState.error!!, color = MaterialTheme.colorScheme.error)
            }
        } else {
            LazyColumn {
                items(uiState.photos) { photo ->
                    PhotoItem(photo = photo, onClick = { onPhotoClick(photo.id) })
                    Divider()
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadPhotos()
    }
}

@Composable
fun PhotoItem(photo: Photograph, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(photo.takenAt ?: "Unknown Date", style = MaterialTheme.typography.bodySmall)
            Text(photo.notes ?: "No notes", style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            Row {
                photo.aperture?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                Spacer(modifier = Modifier.width(8.dp))
                photo.shutterSpeed?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}
