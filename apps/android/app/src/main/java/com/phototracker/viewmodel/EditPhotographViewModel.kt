package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmHolder
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Lens
import com.phototracker.data.model.Photograph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EditPhotographUiState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val photo: Photograph? = null,
    val cameras: List<Camera> = emptyList(),
    val lenses: List<Lens> = emptyList(),
    val films: List<FilmStock> = emptyList(),
    val filmHolders: List<FilmHolder> = emptyList(),
    val error: String? = null,
    val saved: Boolean = false,
    // Form fields
    val frameNumber: String = "",
    val takenAt: String = "",
    val aperture: String = "",
    val shutterSpeed: String = "",
    val iso: String = "",
    val exposureCompensation: String = "",
    val focalLengthMm: String = "",
    val notes: String = "",
    val selectedCameraId: String? = null,
    val selectedLensId: String? = null,
    val selectedFilmId: String? = null,
    val selectedFilmHolderId: String? = null,
)

class EditPhotographViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(EditPhotographUiState())
    val uiState: StateFlow<EditPhotographUiState> = _uiState.asStateFlow()

    fun load(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val photoRes = apiService.getPhotograph(id)
                val camerasRes = apiService.listCameras()
                val lensesRes = apiService.listLenses()
                val filmsRes = apiService.listFilmStocks()
                val filmHoldersRes = apiService.listFilmHolders()

                if (photoRes.isSuccessful) {
                    val photo = photoRes.body()!!
                    _uiState.update { it.copy(
                        isLoading = false,
                        photo = photo,
                        cameras = camerasRes.body()?.items ?: emptyList(),
                        lenses = lensesRes.body()?.items ?: emptyList(),
                        films = filmsRes.body()?.items ?: emptyList(),
                        filmHolders = filmHoldersRes.body()?.items ?: emptyList(),
                        frameNumber = photo.frameNumber ?: "",
                        takenAt = photo.takenAt ?: "",
                        aperture = photo.aperture ?: "",
                        shutterSpeed = photo.shutterSpeed ?: "",
                        iso = photo.iso?.toString() ?: "",
                        exposureCompensation = photo.exposureCompensation ?: "",
                        focalLengthMm = photo.focalLengthMm?.toString() ?: "",
                        notes = photo.notes ?: "",
                        selectedCameraId = photo.cameraId,
                        selectedLensId = photo.lensId,
                        selectedFilmId = photo.filmId,
                        selectedFilmHolderId = photo.filmHolderId,
                    ) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to load photograph") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }

    fun updateField(field: String, value: String) {
        _uiState.update { state ->
            when (field) {
                "frameNumber" -> state.copy(frameNumber = value)
                "takenAt" -> state.copy(takenAt = value)
                "aperture" -> state.copy(aperture = value)
                "shutterSpeed" -> state.copy(shutterSpeed = value)
                "iso" -> state.copy(iso = value)
                "exposureCompensation" -> state.copy(exposureCompensation = value)
                "focalLengthMm" -> state.copy(focalLengthMm = value)
                "notes" -> state.copy(notes = value)
                else -> state
            }
        }
    }

    fun selectCamera(id: String?) { _uiState.update { it.copy(selectedCameraId = id) } }
    fun selectLens(id: String?) { _uiState.update { it.copy(selectedLensId = id) } }
    fun selectFilm(id: String?) { _uiState.update { it.copy(selectedFilmId = id) } }
    fun selectFilmHolder(id: String?) { _uiState.update { it.copy(selectedFilmHolderId = id) } }

    fun save(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                val state = _uiState.value
                val body = buildMap<String, Any?> {
                    put("frame_number", state.frameNumber.takeIf { it.isNotBlank() })
                    put("taken_at", state.takenAt.takeIf { it.isNotBlank() })
                    put("aperture", state.aperture.takeIf { it.isNotBlank() })
                    put("shutter_speed", state.shutterSpeed.takeIf { it.isNotBlank() })
                    put("iso", state.iso.toIntOrNull())
                    put("exposure_compensation", state.exposureCompensation.takeIf { it.isNotBlank() })
                    put("focal_length_mm", state.focalLengthMm.toDoubleOrNull())
                    put("notes", state.notes.takeIf { it.isNotBlank() })
                    put("camera_id", state.selectedCameraId)
                    put("lens_id", state.selectedLensId)
                    put("film_id", state.selectedFilmId)
                    put("film_holder_id", state.selectedFilmHolderId)
                }
                val response = apiService.updatePhotograph(id, body)
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isSaving = false, saved = true) }
                } else {
                    _uiState.update { it.copy(isSaving = false, error = "Failed to save changes") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSaving = false, error = e.message ?: "An error occurred") }
            }
        }
    }
}
