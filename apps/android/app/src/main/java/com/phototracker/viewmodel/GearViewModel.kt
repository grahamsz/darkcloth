package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmStock
import com.phototracker.data.model.Lens
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class GearUiState(
    val isLoading: Boolean = false,
    val cameras: List<Camera> = emptyList(),
    val lenses: List<Lens> = emptyList(),
    val films: List<FilmStock> = emptyList(),
    val error: String? = null,
    val isCreating: Boolean = false
)

class GearViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(GearUiState())
    val uiState: StateFlow<GearUiState> = _uiState.asStateFlow()

    fun loadGear() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val camerasRes = apiService.listCameras()
                val lensesRes = apiService.listLenses()
                val filmsRes = apiService.listFilmStocks()

                if (camerasRes.isSuccessful && lensesRes.isSuccessful && filmsRes.isSuccessful) {
                    _uiState.update { it.copy(
                        isLoading = false,
                        cameras = camerasRes.body()?.items ?: emptyList(),
                        lenses = lensesRes.body()?.items ?: emptyList(),
                        films = filmsRes.body()?.items ?: emptyList()
                    ) }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to load gear") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }

    fun createCamera(name: String, maker: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }
            try {
                val response = apiService.createCamera(mapOf("name" to name, "maker" to maker))
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isCreating = false) }
                    loadGear()
                } else {
                    _uiState.update { it.copy(isCreating = false, error = "Failed to create camera") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isCreating = false, error = e.message) }
            }
        }
    }

    fun createLens(name: String, focalLength: Double?, maxAperture: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }
            try {
                val response = apiService.createLens(mapOf(
                    "name" to name,
                    "focal_length_mm" to focalLength,
                    "max_aperture" to maxAperture
                ))
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isCreating = false) }
                    loadGear()
                } else {
                    _uiState.update { it.copy(isCreating = false, error = "Failed to create lens") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isCreating = false, error = e.message) }
            }
        }
    }

    fun createFilmStock(name: String, iso: Int?, process: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }
            try {
                val response = apiService.createFilmStock(mapOf(
                    "name" to name,
                    "iso" to iso,
                    "process" to process
                ))
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isCreating = false) }
                    loadGear()
                } else {
                    _uiState.update { it.copy(isCreating = false, error = "Failed to create film stock") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isCreating = false, error = e.message) }
            }
        }
    }
}
