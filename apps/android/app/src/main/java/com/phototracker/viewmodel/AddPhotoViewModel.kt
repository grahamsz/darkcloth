package com.phototracker.viewmodel

import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.location.LocationServices
import com.phototracker.api.ApiClient
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Lens
import com.phototracker.data.model.Roll
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
    val error: String? = null,
    val cameras: List<Camera> = emptyList(),
    val lenses: List<Lens> = emptyList(),
    val filmStocks: List<FilmStock> = emptyList(),
    val rolls: List<Roll> = emptyList(),
    val isFetchingGear: Boolean = false
)

class AddPhotoViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)
    private val fusedLocationClient = LocationServices.getFusedLocationProviderClient(application)

    private val _uiState = MutableStateFlow(AddPhotoUiState())
    val uiState: StateFlow<AddPhotoUiState> = _uiState.asStateFlow()

    init {
        refreshData()
    }

    fun refreshData() {
        captureLocation()
        loadGear()
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

    private fun loadGear() {
        viewModelScope.launch {
            _uiState.update { it.copy(isFetchingGear = true) }
            try {
                val camerasRes = apiService.listCameras()
                val lensesRes = apiService.listLenses()
                val filmsRes = apiService.listFilmStocks()
                val rollsRes = apiService.listRolls()

                _uiState.update { state ->
                    state.copy(
                        isFetchingGear = false,
                        cameras = camerasRes.body()?.items ?: emptyList(),
                        lenses = lensesRes.body()?.items ?: emptyList(),
                        filmStocks = filmsRes.body()?.items ?: emptyList(),
                        rolls = rollsRes.body()?.items ?: emptyList()
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isFetchingGear = false, error = "Failed to load gear: ${e.message}") }
            }
        }
    }

    fun captureLocation() {
        val context = getApplication<Application>().applicationContext
        val hasFineLocation = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarseLocation = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        if (!hasFineLocation && !hasCoarseLocation) {
            return
        }

        viewModelScope.launch {
            try {
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
