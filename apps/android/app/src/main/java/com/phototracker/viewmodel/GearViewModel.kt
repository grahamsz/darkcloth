package com.phototracker.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.Camera
import com.phototracker.data.model.FilmHolder
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
    val filmHolders: List<FilmHolder> = emptyList(),
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
                val filmHoldersRes = apiService.listFilmHolders()

                if (camerasRes.isSuccessful && lensesRes.isSuccessful && filmsRes.isSuccessful) {
                    _uiState.update { it.copy(
                        isLoading = false,
                        cameras = camerasRes.body()?.items ?: emptyList(),
                        lenses = lensesRes.body()?.items ?: emptyList(),
                        films = filmsRes.body()?.items ?: emptyList(),
                        filmHolders = filmHoldersRes.body()?.items ?: emptyList()
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

    fun updateCamera(id: String, name: String, maker: String?) {
        viewModelScope.launch {
            try {
                val response = apiService.updateCamera(id, mapOf("name" to name, "maker" to maker))
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to update camera") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun deleteCamera(id: String) {
        viewModelScope.launch {
            try {
                val response = apiService.deleteCamera(id)
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to delete camera") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
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

    fun updateLens(id: String, name: String, focalLength: Double?, maxAperture: String?) {
        viewModelScope.launch {
            try {
                val response = apiService.updateLens(id, mapOf(
                    "name" to name,
                    "focal_length_mm" to focalLength,
                    "max_aperture" to maxAperture
                ))
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to update lens") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun deleteLens(id: String) {
        viewModelScope.launch {
            try {
                val response = apiService.deleteLens(id)
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to delete lens") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
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

    fun updateFilmStock(id: String, name: String, iso: Int?, process: String?) {
        viewModelScope.launch {
            try {
                val response = apiService.updateFilmStock(id, mapOf(
                    "name" to name,
                    "iso" to iso,
                    "process" to process
                ))
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to update film stock") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun deleteFilmStock(id: String) {
        viewModelScope.launch {
            try {
                val response = apiService.deleteFilmStock(id)
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to delete film stock") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun createFilmHolder(name: String, type: String?, brand: String?, widthMm: Double?, heightMm: Double?, capacity: Int?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }
            try {
                val response = apiService.createFilmHolder(mapOf(
                    "name" to name,
                    "type" to type,
                    "brand" to brand,
                    "width_mm" to widthMm,
                    "height_mm" to heightMm,
                    "capacity" to capacity
                ))
                if (response.isSuccessful) {
                    _uiState.update { it.copy(isCreating = false) }
                    loadGear()
                } else {
                    _uiState.update { it.copy(isCreating = false, error = "Failed to create film holder") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isCreating = false, error = e.message) }
            }
        }
    }

    fun updateFilmHolder(id: String, name: String, type: String?, brand: String?, widthMm: Double?, heightMm: Double?, capacity: Int?) {
        viewModelScope.launch {
            try {
                val response = apiService.updateFilmHolder(id, mapOf(
                    "name" to name,
                    "type" to type,
                    "brand" to brand,
                    "width_mm" to widthMm,
                    "height_mm" to heightMm,
                    "capacity" to capacity
                ))
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to update film holder") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun deleteFilmHolder(id: String) {
        viewModelScope.launch {
            try {
                val response = apiService.deleteFilmHolder(id)
                if (response.isSuccessful) loadGear()
                else _uiState.update { it.copy(error = "Failed to delete film holder") }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }
}
