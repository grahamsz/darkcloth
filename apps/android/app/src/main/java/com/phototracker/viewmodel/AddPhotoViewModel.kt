package com.phototracker.viewmodel

import android.app.Application
import android.location.Location
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.LocationServices
import com.phototracker.api.ApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

data class AddPhotoUiState(
    val rollId: String? = null,
    val cameraId: String? = null,
    val lensId: String? = null,
    val filmId: String? = null,
    val frameNumber: String = "",
    val notes: String = "",
    val aperture: String = "",
    val shutterSpeed: String = "",
    val iso: Int? = null,
    val exposureCompensation: String = "",
    val focalLengthMm: Double? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

class AddPhotoViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)
    private val fusedLocationClient = LocationServices.getFusedLocationProviderClient(application)

    private val _uiState = MutableStateFlow(AddPhotoUiState())
    val uiState: StateFlow<AddPhotoUiState> = _uiState.asStateFlow()

    init {
        captureLocation()
        loadRecentGear()
    }

    fun updateRollId(id: String?) { _uiState.update { it.copy(rollId = id) } }
    fun updateCameraId(id: String?) { _uiState.update { it.copy(cameraId = id) } }
    fun updateLensId(id: String?) { _uiState.update { it.copy(lensId = id) } }
    fun updateFilmId(id: String?) { _uiState.update { it.copy(filmId = id) } }
    fun updateFrameNumber(frame: String) { _uiState.update { it.copy(frameNumber = frame) } }
    fun updateNotes(notes: String) { _uiState.update { it.copy(notes = notes) } }
    fun updateAperture(aperture: String) { _uiState.update { it.copy(aperture = aperture) } }
    fun updateShutterSpeed(shutterSpeed: String) { _uiState.update { it.copy(shutterSpeed = shutterSpeed) } }
    fun updateIso(iso: Int?) { _uiState.update { it.copy(iso = iso) } }
    fun updateExposureCompensation(ec: String) { _uiState.update { it.copy(exposureCompensation = ec) } }
    fun updateFocalLength(fl: Double?) { _uiState.update { it.copy(focalLengthMm = fl) } }

    private fun loadRecentGear() {
        // In a real app, this would load from a local DB or separate 'recent' endpoint
        // For now, we'll just have the UI fetch these if needed or provide placeholders
    }

    fun captureLocation() {
        viewModelScope.launch {
            try {
                // Simplified: assuming permissions are granted for now
                val location: Location? = fusedLocationClient.lastLocation.await()
                location?.let {
                    _uiState.update { state -> state.copy(latitude = it.latitude, longitude = it.longitude) }
                }
            } catch (e: Exception) {
                // Handle location error
            }
        }
    }

    fun save() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val state = _uiState.value
                val body = mutableMapOf<String, Any?>(
                    "roll_id" to state.rollId,
                    "camera_id" to state.cameraId,
                    "lens_id" to state.lensId,
                    "film_id" to state.filmId,
                    "frame_number" to state.frameNumber,
                    "notes" to state.notes,
                    "aperture" to state.aperture,
                    "shutter_speed" to state.shutterSpeed,
                    "iso" to state.iso,
                    "exposure_compensation" to state.exposureCompensation,
                    "focal_length_mm" to state.focalLengthMm,
                    "latitude" to state.latitude,
                    "longitude" to state.longitude
                )
                val response = apiService.createPhotograph(body)
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to save photograph") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }
}
