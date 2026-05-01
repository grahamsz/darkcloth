package com.phototracker.viewmodel

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phototracker.api.ApiClient
import com.phototracker.data.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream

data class PhotoDetailUiState(
    val isLoading: Boolean = false,
    val photo: Photograph? = null,
    val images: List<PhotographImage> = emptyList(),
    val cameras: Map<String, Camera> = emptyMap(),
    val lenses: Map<String, Lens> = emptyMap(),
    val films: Map<String, FilmStock> = emptyMap(),
    val rolls: Map<String, Roll> = emptyMap(),
    val error: String? = null,
    val deleteSuccess: Boolean = false,
    val isUploadingImage: Boolean = false
)

class PhotoDetailViewModel(application: Application) : AndroidViewModel(application) {
    private val apiService = ApiClient.getApiService(application)

    private val _uiState = MutableStateFlow(PhotoDetailUiState())
    val uiState: StateFlow<PhotoDetailUiState> = _uiState.asStateFlow()

    fun loadPhoto(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val photoRes = apiService.getPhotograph(id)
                if (!photoRes.isSuccessful) {
                    _uiState.update { it.copy(isLoading = false, error = "Failed to load photo details") }
                    return@launch
                }
                val imagesRes = try { apiService.listPhotographImages(id) } catch (_: Exception) { null }
                val camerasRes = try { apiService.listCameras() } catch (_: Exception) { null }
                val lensesRes = try { apiService.listLenses() } catch (_: Exception) { null }
                val filmsRes = try { apiService.listFilmStocks() } catch (_: Exception) { null }
                val rollsRes = try { apiService.listRolls() } catch (_: Exception) { null }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        photo = photoRes.body(),
                        images = imagesRes?.body()?.get("items") ?: emptyList(),
                        cameras = camerasRes?.body()?.items?.associateBy { c -> c.id } ?: emptyMap(),
                        lenses = lensesRes?.body()?.items?.associateBy { l -> l.id } ?: emptyMap(),
                        films = filmsRes?.body()?.items?.associateBy { f -> f.id } ?: emptyMap(),
                        rolls = rollsRes?.body()?.items?.associateBy { r -> r.id } ?: emptyMap()
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "An error occurred") }
            }
        }
    }

    fun deletePhotograph(id: String) {
        viewModelScope.launch {
            try {
                val response = apiService.deletePhotograph(id)
                if (response.isSuccessful) {
                    _uiState.update { it.copy(deleteSuccess = true) }
                } else {
                    _uiState.update { it.copy(error = "Failed to delete photograph") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "An error occurred") }
            }
        }
    }

    fun uploadImage(photographId: String, uri: Uri) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUploadingImage = true) }
            try {
                val context = getApplication<Application>().applicationContext
                val file = getFileFromUri(context, uri) ?: throw Exception("Failed to process image file")
                val requestFile = file.asRequestBody(context.contentResolver.getType(uri)?.toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", file.name, requestFile)
                val response = apiService.uploadPhotographImage(photographId, part)
                file.delete()
                if (response.isSuccessful) {
                    response.body()?.let { img ->
                        _uiState.update { it.copy(isUploadingImage = false, images = it.images + img) }
                    } ?: _uiState.update { it.copy(isUploadingImage = false) }
                } else {
                    _uiState.update { it.copy(isUploadingImage = false, error = "Image upload failed") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isUploadingImage = false, error = e.message ?: "Upload failed") }
            }
        }
    }

    fun deleteImage(photographId: String, imageId: String) {
        viewModelScope.launch {
            try {
                val response = apiService.deletePhotographImage(photographId, imageId)
                if (response.isSuccessful) {
                    _uiState.update { it.copy(images = it.images.filter { img -> img.id != imageId }) }
                } else {
                    _uiState.update { it.copy(error = "Failed to delete image") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message ?: "An error occurred") }
            }
        }
    }

    private fun getFileFromUri(context: Context, uri: Uri): File? {
        val inputStream = context.contentResolver.openInputStream(uri) ?: return null
        val file = File(context.cacheDir, "temp_upload_${System.currentTimeMillis()}.jpg")
        val outputStream = FileOutputStream(file)
        inputStream.copyTo(outputStream)
        inputStream.close()
        outputStream.close()
        return file
    }
}
