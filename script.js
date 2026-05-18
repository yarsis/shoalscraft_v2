const grass = document.getElementById("grass");
const sound = document.getElementById("sound");

grass.addEventListener("click", async () => {

  // play sound
  sound.currentTime = 0;
  sound.play();

  // animation
  grass.classList.add("clicked");

  setTimeout(() => {
    grass.classList.remove("clicked");
  }, 80);

  // send analytics event
  try {

    await fetch("YOUR_WORKER_URL/api/click", {
      method: "POST"
    });

  } catch (err) {
    console.log(err);
  }

});
