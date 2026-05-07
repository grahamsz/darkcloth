package com.phototracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.phototracker.viewmodel.EditPhotographViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditPhotographScreen(
    id: String,
    onBack: () -> Unit,
    viewModel: EditPhotographViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(id) { viewModel.load(id) }
    LaunchedEffect(uiState.saved) { if (uiState.saved) onBack() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit Photograph") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { viewModel.save(id) },
                        enabled = !uiState.isSaving
                    ) {
                        if (uiState.isSaving) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Save")
                        }
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
            uiState.error != null && uiState.photo == null -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) { Text(uiState.error!!, color = MaterialTheme.colorScheme.error) }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (uiState.error != null) {
                        Text(uiState.error!!, color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall)
                    }

                    SectionLabel("Frame")
                    OutlinedTextField(
                        value = uiState.frameNumber,
                        onValueChange = { viewModel.updateField("frameNumber", it) },
                        label = { Text("Frame #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = uiState.takenAt,
                        onValueChange = { viewModel.updateField("takenAt", it) },
                        label = { Text("Date/Time (ISO 8601)") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    SectionLabel("Exposure")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = uiState.aperture,
                            onValueChange = { viewModel.updateField("aperture", it) },
                            label = { Text("Aperture") },
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = uiState.shutterSpeed,
                            onValueChange = { viewModel.updateField("shutterSpeed", it) },
                            label = { Text("Shutter") },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = uiState.iso,
                            onValueChange = { viewModel.updateField("iso", it) },
                            label = { Text("ISO") },
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = uiState.exposureCompensation,
                            onValueChange = { viewModel.updateField("exposureCompensation", it) },
                            label = { Text("Exp Comp") },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    OutlinedTextField(
                        value = uiState.focalLengthMm,
                        onValueChange = { viewModel.updateField("focalLengthMm", it) },
                        label = { Text("Focal Length (mm)") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    SectionLabel("Gear")
                    EditGearDropdown(
                        label = "Camera",
                        options = uiState.cameras.map { it.id to it.name },
                        selectedId = uiState.selectedCameraId,
                        onSelect = { viewModel.selectCamera(it) }
                    )
                    EditGearDropdown(
                        label = "Lens",
                        options = uiState.lenses.map { it.id to it.name },
                        selectedId = uiState.selectedLensId,
                        onSelect = { viewModel.selectLens(it) }
                    )
                    EditGearDropdown(
                        label = "Film",
                        options = uiState.films.map { it.id to it.name },
                        selectedId = uiState.selectedFilmId,
                        onSelect = { viewModel.selectFilm(it) }
                    )

                    SectionLabel("Notes")
                    OutlinedTextField(
                        value = uiState.notes,
                        onValueChange = { viewModel.updateField("notes", it) },
                        label = { Text("Notes") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 6
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 4.dp)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditGearDropdown(
    label: String,
    options: List<Pair<String, String>>,
    selectedId: String?,
    onSelect: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = options.find { it.first == selectedId }?.second ?: "None"

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = { onSelect(null); expanded = false }
            )
            options.forEach { (id, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = { onSelect(id); expanded = false }
                )
            }
        }
    }
}
