package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Lens
import com.phototracker.viewmodel.GearViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GearManagementScreen(viewModel: GearViewModel = viewModel()) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Cameras", "Lenses", "Films")
    val uiState by viewModel.uiState.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add Gear")
            }
        }
    ) { innerPadding ->
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)) {
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
    }

    if (showAddDialog) {
        when (selectedTab) {
            0 -> AddCameraDialog(
                onDismiss = { showAddDialog = false },
                onAdd = { name, maker ->
                    viewModel.createCamera(name, maker)
                    showAddDialog = false
                }
            )
            1 -> AddLensDialog(
                onDismiss = { showAddDialog = false },
                onAdd = { name, fl, aperture ->
                    viewModel.createLens(name, fl, aperture)
                    showAddDialog = false
                }
            )
            2 -> AddFilmDialog(
                onDismiss = { showAddDialog = false },
                onAdd = { name, iso, process ->
                    viewModel.createFilmStock(name, iso, process)
                    showAddDialog = false
                }
            )
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadGear()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCameraDialog(onDismiss: () -> Unit, onAdd: (String, String?) -> Unit) {
    var name by remember { mutableStateOf("") }
    var maker by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Camera") },
        text = {
            Column {
                TextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
                Spacer(modifier = Modifier.height(8.dp))
                TextField(value = maker, onValueChange = { maker = it }, label = { Text("Maker") })
            }
        },
        confirmButton = {
            Button(onClick = { onAdd(name, maker.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddLensDialog(onDismiss: () -> Unit, onAdd: (String, Double?, String?) -> Unit) {
    var name by remember { mutableStateOf("") }
    var fl by remember { mutableStateOf("") }
    var aperture by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Lens") },
        text = {
            Column {
                TextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
                Spacer(modifier = Modifier.height(8.dp))
                TextField(value = fl, onValueChange = { fl = it }, label = { Text("Focal Length (mm)") })
                Spacer(modifier = Modifier.height(8.dp))
                TextField(value = aperture, onValueChange = { aperture = it }, label = { Text("Max Aperture (e.g. f/1.4)") })
            }
        },
        confirmButton = {
            Button(onClick = { onAdd(name, fl.toDoubleOrNull(), aperture.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddFilmDialog(onDismiss: () -> Unit, onAdd: (String, Int?, String?) -> Unit) {
    var name by remember { mutableStateOf("") }
    var iso by remember { mutableStateOf("") }
    var process by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Film Stock") },
        text = {
            Column {
                TextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
                Spacer(modifier = Modifier.height(8.dp))
                TextField(value = iso, onValueChange = { iso = it }, label = { Text("ISO") })
                Spacer(modifier = Modifier.height(8.dp))
                TextField(value = process, onValueChange = { process = it }, label = { Text("Process (e.g. C-41)") })
            }
        },
        confirmButton = {
            Button(onClick = { onAdd(name, iso.toIntOrNull(), process.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
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
