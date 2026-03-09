import React, { Component } from 'react';
import { Link, Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/TwitchLoginButton";

class App extends Component<{}, {}> {
  render() {
    return (
      <div className='App'>
        <h1> Fwitz Channel Points</h1>

        <ul className='header'>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/about">About</Link>
          </li>
          <li>
            <Link to="/contact">Contact</Link>
          </li>
          <li>
            <Link to="/login">Login</Link>
          </li>
        </ul>

        <div className='pageContent'>
          <Routes>
            <Route path='/' element={<Home/>} />
            <Route path='/about' element={<About/>} />
            <Route path='/contact' element={<Contact/>} />
            <Route path='/login' element={<Login/>} />

            {/* For unknown route paths */}
            <Route path='*' element={<Navigate to='/' replace />} />
          </Routes>

        </div>
      </div>

    );
  }
}

export default App;