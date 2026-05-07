package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
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

    var editingCamera by remember { mutableStateOf<Camera?>(null) }
    var editingLens by remember { mutableStateOf<Lens?>(null) }
    var editingFilm by remember { mutableStateOf<FilmStock?>(null) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Gear")
            }
        }
    ) { innerPadding ->
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)) {

            if (uiState.error != null) {
                Text(
                    uiState.error!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

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
                0 -> CameraList(
                    cameras = uiState.cameras,
                    onEdit = { editingCamera = it },
                    onDelete = { viewModel.deleteCamera(it.id) }
                )
                1 -> LensList(
                    lenses = uiState.lenses,
                    onEdit = { editingLens = it },
                    onDelete = { viewModel.deleteLens(it.id) }
                )
                2 -> FilmStockList(
                    films = uiState.films,
                    onEdit = { editingFilm = it },
                    onDelete = { viewModel.deleteFilmStock(it.id) }
                )
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

    editingCamera?.let { camera ->
        EditCameraDialog(
            camera = camera,
            onDismiss = { editingCamera = null },
            onSave = { name, maker ->
                viewModel.updateCamera(camera.id, name, maker)
                editingCamera = null
            }
        )
    }

    editingLens?.let { lens ->
        EditLensDialog(
            lens = lens,
            onDismiss = { editingLens = null },
            onSave = { name, fl, aperture ->
                viewModel.updateLens(lens.id, name, fl, aperture)
                editingLens = null
            }
        )
    }

    editingFilm?.let { film ->
        EditFilmDialog(
            film = film,
            onDismiss = { editingFilm = null },
            onSave = { name, iso, process ->
                viewModel.updateFilmStock(film.id, name, iso, process)
                editingFilm = null
            }
        )
    }

    LaunchedEffect(Unit) { viewModel.loadGear() }
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
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = maker, onValueChange = { maker = it }, label = { Text("Maker") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = { onAdd(name, maker.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Add")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditCameraDialog(camera: Camera, onDismiss: () -> Unit, onSave: (String, String?) -> Unit) {
    var name by remember { mutableStateOf(camera.name) }
    var maker by remember { mutableStateOf(camera.maker ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Camera") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = maker, onValueChange = { maker = it }, label = { Text("Maker") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = { onSave(name, maker.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
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
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = fl, onValueChange = { fl = it }, label = { Text("Focal Length (mm)") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = aperture, onValueChange = { aperture = it }, label = { Text("Max Aperture") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = { onAdd(name, fl.toDoubleOrNull(), aperture.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Add")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditLensDialog(lens: Lens, onDismiss: () -> Unit, onSave: (String, Double?, String?) -> Unit) {
    var name by remember { mutableStateOf(lens.name) }
    var fl by remember { mutableStateOf(lens.focalLengthMm?.toString() ?: "") }
    var aperture by remember { mutableStateOf(lens.maxAperture ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Lens") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = fl, onValueChange = { fl = it }, label = { Text("Focal Length (mm)") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = aperture, onValueChange = { aperture = it }, label = { Text("Max Aperture") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = { onSave(name, fl.toDoubleOrNull(), aperture.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
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
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = iso, onValueChange = { iso = it }, label = { Text("ISO") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = process, onValueChange = { process = it }, label = { Text("Process (e.g. C-41)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = { onAdd(name, iso.toIntOrNull(), process.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Add")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditFilmDialog(film: FilmStock, onDismiss: () -> Unit, onSave: (String, Int?, String?) -> Unit) {
    var name by remember { mutableStateOf(film.name) }
    var iso by remember { mutableStateOf(film.iso?.toString() ?: "") }
    var process by remember { mutableStateOf(film.process ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Film Stock") },
        text = {
            Column {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = iso, onValueChange = { iso = it }, label = { Text("ISO") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = process, onValueChange = { process = it }, label = { Text("Process") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = { onSave(name, iso.toIntOrNull(), process.takeIf { it.isNotBlank() }) }, enabled = name.isNotBlank()) {
                Text("Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun CameraList(cameras: List<Camera>, onEdit: (Camera) -> Unit, onDelete: (Camera) -> Unit) {
    LazyColumn {
        items(cameras, key = { it.id }) { camera ->
            ListItem(
                headlineContent = { Text(camera.name) },
                supportingContent = { camera.maker?.let { Text(it) } },
                trailingContent = {
                    Row {
                        IconButton(onClick = { onEdit(camera) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier.size(18.dp))
                        }
                        IconButton(onClick = { onDelete(camera) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete",
                                modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            )
            Divider()
        }
    }
}

@Composable
fun LensList(lenses: List<Lens>, onEdit: (Lens) -> Unit, onDelete: (Lens) -> Unit) {
    LazyColumn {
        items(lenses, key = { it.id }) { lens ->
            ListItem(
                headlineContent = { Text(lens.name) },
                supportingContent = {
                    Text("${lens.focalLengthMm ?: "??"}mm ${lens.maxAperture ?: ""}")
                },
                trailingContent = {
                    Row {
                        IconButton(onClick = { onEdit(lens) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier.size(18.dp))
                        }
                        IconButton(onClick = { onDelete(lens) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete",
                                modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            )
            Divider()
        }
    }
}

@Composable
fun FilmStockList(films: List<FilmStock>, onEdit: (FilmStock) -> Unit, onDelete: (FilmStock) -> Unit) {
    LazyColumn {
        items(films, key = { it.id }) { film ->
            ListItem(
                headlineContent = { Text(film.name) },
                supportingContent = {
                    Text("ISO ${film.iso ?: "??"} · ${film.process ?: ""}")
                },
                trailingContent = {
                    Row {
                        IconButton(onClick = { onEdit(film) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier.size(18.dp))
                        }
                        IconButton(onClick = { onDelete(film) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete",
                                modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            )
            Divider()
        }
    }
}
