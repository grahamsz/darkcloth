package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Lens
import com.phototracker.viewmodel.GearViewModel

@Composable
fun GearManagementScreen(viewModel: GearViewModel = viewModel()) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Cameras", "Lenses", "Films")
    val uiState by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }

        when (selectedTab) {
            0 -> CameraList(uiState.cameras)
            1 -> LensList(uiState.lenses)
            2 -> FilmStockList(uiState.films)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadGear()
    }
}

@Composable
fun CameraList(cameras: List<Camera>) {
    LazyColumn {
        items(cameras) { camera ->
            ListItem(
                headlineContent = { Text(camera.name) },
                supportingContent = { camera.maker?.let { Text(it) } }
            )
            Divider()
        }
    }
}

@Composable
fun LensList(lenses: List<Lens>) {
    LazyColumn {
        items(lenses) { lens ->
            ListItem(
                headlineContent = { Text(lens.name) },
                supportingContent = { 
                    Text("${lens.focalLengthMm ?: "?? "}mm ${lens.maxAperture ?: ""}")
                }
            )
            Divider()
        }
    }
}

@Composable
fun FilmStockList(films: List<FilmStock>) {
    LazyColumn {
        items(films) { film ->
            ListItem(
                headlineContent = { Text(film.name) },
                supportingContent = { 
                    Text("ISO ${film.iso ?: "?? "} - ${film.process ?: ""}")
                }
            )
            Divider()
        }
    }
}
